import * as helpers from './helpers';
import {BasicChart} from './basic-chart';
let d3 = require('d3');

export default class PoliticalDonorChart extends BasicChart {
  constructor(chartType, ...args) {
    super();

    let p = new Promise((res, rej) => {
      d3.csv('data/uk_political_donors.csv', (err, data) => err ? rej(err) : res(data));
    });


    p.then((data) => {
      this.data = data;
      this[chartType].call(this, ...args);
    });
  }

  histogram() {
    let data = this.data.filter((d) => d.EntityName.match(' MP'));
    let nameId = helpers.nameId(data, (d) => d.EntityName);
    let histogram = d3.layout.histogram()
                        .bins(nameId.range())
                        .value((d) => nameId(d.EntityName))(data);

    this.margin = {top : 10, right : 40, bottom : 100, left : 50};

    let x = d3.scale.linear()
      .domain([0, d3.max(histogram, (d) => d.x)])
      .range([this.margin.left, this.width-this.margin.right]);

    let y = d3.scale.log().domain([1, d3.max(histogram, (d) => d.y)])
      .range([ this.height - this.margin.bottom, this.margin.top ]);

    let yAxis = d3.svg.axis()
         .scale(y)
         .tickFormat(d3.format('f'))
         .orient('left');

    this.chart.append('g')
     .classed('axis', true)
     .attr('transform', 'translate(50, 0)')
     .call(yAxis);

    let bar = this.chart.selectAll('.bar')
               .data(histogram)
               .enter()
               .append('g')
               .classed('bar', true)
               .attr('transform', (d) => `translate(${x(d.x)},${y(d.y)})`);

    bar.append('rect')
      .attr({
        x: 1,
        width: x(histogram[0].dx) - this.margin.left - 1,
        height: (d) => this.height - this.margin.bottom - y(d.y) 
      });


    bar.append('text')
      .text((d) => d[0].EntityName)
      .attr({
        transform: (d) => `translate(0, ${this.height - this.margin.bottom - y(d.y) + 7}) rotate(60)`
      });

    require('./chapter5.css');
  }

  pie(name) {
    let data = this.data;
    let filtered = data.filter((d) => d.EntityName === name);
    let perDonor = helpers.binPerName(filtered, (d) => d.DonorName);
    let pie = d3.layout.pie()
      .value((d) => d.length)(perDonor);

    let arc = d3.svg.arc()
      .outerRadius(150)
      .startAngle((d) => d.startAngle)
      .endAngle((d) => d.endAngle);

    helpers.fixateColors(data);

    let slice = this.chart.selectAll('.slice')
               .data(pie)
               .enter()
               .append('g')
               .attr('transform', 'translate(300, 300)');

    slice.append('path')
      .attr({
        d: arc,
        fill: (d) => helpers.color(d.data[0].DonorName)
      });

    slice.call(helpers.arcLabels((d) => `${d.data[0].DonorName} (${d.value})`, arc.outerRadius()));
  }

  streamgraph() {
    let time = d3.time.format('%d/%m/%y');
    let data = this.data;
    let extent = d3.extent(data.map((d) => time.parse(d.ReceivedDate)));
    let timeBins = d3.time.days(extent[0], extent[1], 12);

    let perName = helpers.binPerName(data, (d) => d.EntityName);
    let timeBinned  = perName.map((nameLayer) => {
      return {
        to: nameLayer[0].EntityName,
        values: d3.layout.histogram()
              .bins(timeBins)
              .value((d) => time.parse(d.ReceivedDate))(nameLayer)
      }
    });

    let layers = d3.layout.stack()
      .order('inside-out')
      .offset('wiggle')
      .values((d) => d.values)(timeBinned);

    this.margin = {
      top: 220,
      right: 50,
      bottom: 0,
      left: 50
    };

    let x = d3.time.scale()
      .domain(extent)
      .range([this.margin.left, this.width - this.margin.right]);

    let y = d3.scale.linear()
      .domain([0, d3.max(layers, (layer) => d3.max(layer.values, (d) => d.y0 + d.y))])
      .range([this.height - this.margin.top, 0]);

    let offset = 100;
    let area = d3.svg.area()
      .x((d) => x(d.x))
      .y0((d) => y(d.y0) + offset)
      .y1((d) => y(d.y0 + d.y) + offset);

    let xAxis = d3.svg.axis()
      .scale(x)
      .tickFormat(d3.time.format('%b %Y'))
      .ticks(d3.time.months, 2)
      .orient('bottom');

    this.chart.append('g')
      .attr('transform', `translate(0, ${this.height - 100})`)
      .classed('axis', true)
      .call(xAxis)
      .selectAll('text')
        .attr('y', 5)
        .attr('x', 9)
        .attr('dy', '.35em')
        .attr('transform', 'rotate(60)')
        .style('text-anchor', 'start');

    this.chart.selectAll('path')
      .data(layers)
      .enter()
      .append('path')
      .attr('d', (d) => area(d.values))
      .style('fill', (d, i) => helpers.color(i))
      .call(helpers.tooltip((d) => d.to, this.chart));

    require('./chapter5.css');
  }

  chord(filterString, mpWidth) {
    let data = this.data;
    let filtered = data.filter((d) => d.EntityName.match(filterString || ' MP') );
    let uniqueMPs = helpers.uniques(filtered, (d) => d.EntityName);
    uniqueMPs.forEach((v) => {
      filtered.push({
        DonorName: v,
        EntityName: v,
        Value: '9001'
      });
    });

    let uniques = helpers.uniques(filtered, (d) => d.DonorName);
    let matrix = helpers.connectionMatrix(filtered);
    let innerRadius = Math.min(this.width, this.height) * 0.3;
    let outerRadius = innerRadius * 1.1;

    let chord = d3.layout.chord()
      .padding(.05)
      .sortGroups(d3.descending)
      .sortSubgroups(d3.descending)
      .sortChords(d3.descending)
      .matrix(matrix);

    let diagram = this.chart.append('g')
      .attr('transform', `translate(${this.width / 2},${this.height / 2})`);

    let group = diagram.selectAll('.group')
      .data(chord.groups)
        .enter().append('g');

    let arc = d3.svg.arc()
      .innerRadius(innerRadius)
      .outerRadius(outerRadius);

    group.append('path')
      .attr('d', arc)
      .attr('fill', (d) => helpers.color(d.index));

    group.call(helpers.arcLabels((d) => uniques[d.index], () => outerRadius+10));

    diagram.append('g')
           .classed('chord', true)
           .selectAll('path')
           .data(chord.chords)
           .enter()
           .append('path')
           .attr('d', d3.svg.chord().radius(innerRadius))
           .attr('fill', (d) => helpers.color(d.target.index));

    this.chart.selectAll('text').filter(function(d) { return d3.select(this).text().match(filterString)})
      .style('font-weight', 'bold');
  }

  /**
   * Incomplete — the hover state is weird.
   * @param  {[type]} filterString =             ' MP' [description]
   * @return {[type]}              [description]
   */
  force(filterString = ' MP') {
    let filtered = this.data.filter((d) => d.EntityName.match(filterString) );
    let nameId = helpers.nameId(helpers.allUniqueNames(filtered), (d) => d);
    let uniques = helpers.allUniqueNames(filtered);
    let matrix = helpers.connectionMatrix(filtered); 

    let nodes = uniques.map((name) => new Object({name: name}))
    let links = filtered.map((d) => {
      return {
        source: nameId(d.DonorName),
        sourceName: d.DonorName,
        target: nameId(d.EntityName),
        targetName: d.EntityName,
        amountDonated: matrix[nameId(d.DonorName)][nameId(d.EntityName)]
      }
    });

    let force = d3.layout.force()
               .nodes(nodes)
               .links(links)
               .gravity(0.2)
               .size([this.width, this.height]);

    force.start();

    let weight = d3.scale.linear()
      .domain(d3.extent(nodes.map((d) => d.weight)))
      .range([5, 30]);

    let distance = d3.scale.linear()
       .domain(d3.extent(d3.merge(matrix)))
       .range([300, 100]);

    force.linkDistance((d) => distance(d.amountDonated));
    force.start();

    let given = d3.scale.linear()
       .range([2, 35]);

    let link = this.chart.selectAll('line')
      .data(links)
      .enter()
        .append('line')
        .classed('link', true);

    let node = this.chart.selectAll('circle')
      .data(nodes)
      .enter()
        .append('circle')
        .attr({
          r: (d) => weight(d.weight),
          fill: (d) => helpers.color(d.index),
          class: (d) => 'name_' + nameId(d.name)
        })
        .classed('node', true)
        .on('mouseover', (d) => highlight(d, uniques, given, matrix, nameId))
        .on('mouseout', (d) => dehighlight(d, weight));

    node.call(helpers.tooltip((d) => d.name, this.chart));
    node.call(force.drag);

    force.on('tick', () => {
      link.attr('x1', (d) => d.source.x)
      .attr('y1', (d) => d.source.y)
      .attr('x2', (d) => d.target.x)
      .attr('y2', (d) => d.target.y);

      node.attr('cx', (d) => d.x)
      .attr('cy', (d) => d.y);
    });


    function highlight (d, uniques, given, matrix, nameId) {
      given.domain(d3.extent(matrix[nameId(d.name)])); // TODO fix this scale
      uniques.map((name) => {
        let amount = matrix[nameId(d.name)][nameId(name)];
        if (name !== d.name) {
          d3.selectAll('circle.name_' + nameId(name))
          .transition()
          .attr('r', given(amount));
        }
      });
    }

    function dehighlight (d, weight) {
      d3.selectAll('.node')
      .transition()
      .attr('r', (d) => {
        return weight(d.weight)
      });
    }

    require('./chapter5.css');
  }

  tree(filterString = ' MP') {
    let data = this.data;
    let filtered = data.filter((d) => d.EntityName.match(filterString) );
    helpers.fixateColors(filtered);

    let tree = helpers.makeTree(filtered,
      (d, name) => d.DonorName === name,
      (d) => d.EntityName,
      (d) => d.EntityName || '');

    tree.children = tree.children.filter((d) => d.children.length > 1)

    let diagonal = d3.svg.diagonal.radial()
      .projection((d) => [d.y, d.x / 180 * Math.PI]);

    let layout = d3.layout.tree()
        .size([360, this.width / 5]);
    let nodes = layout.nodes(tree);
    let links = layout.links(nodes);

    let chart = this.chart.append('g')
      .attr('transform', `translate(${this.width / 2},${this.height / 2})`);

    let link = chart.selectAll('.link')
      .data(links)
        .enter()
        .append('path')
        .attr('class', 'link')
        .attr('d', diagonal);

    let node = chart.selectAll('.node')
      .data(nodes)
      .enter().append('g')
      .attr('class', 'node')
      .attr('transform', (d) => `rotate(${d.x - 90})translate(${d.y})`);

    node.append('circle')
      .attr('r', 4.5)
      .attr('fill', (d) => helpers.color(d.name))
      .on('mouseover', function(d) {
        d3.select(this.nextSibling).style('visibility', 'visible');
      })
      .on('mouseout', function(d) {
        d3.select(this.nextSibling).style('visibility', 'hidden');
      });

    node.append('text')
      .attr('dy', '.31em')
      .attr('text-anchor', (d) => d.x < 180 ? 'start' : 'end')
      .attr('transform', (d) => d.x < 180 ? 'translate(8)' : 'rotate(180)translate(-8)')
      .text((d) => d.depth > 1 ? d.name : d.name.substr(0, 15) + (d.name.length > 15 ? '...' : ''))
      .style({
        'font-size': (d) => d.depth > 1 ? '0.6em' : '0.9em',
        'visibility': (d) => d.depth > 0 ? 'hidden' : 'visible'
      });

    require('./chapter5.css');
  }

  partition(filterString = ' MP') {
    let filtered = this.data.filter((d) => d.EntityName.match(filterString) );
    let tree = helpers.makeTree(filtered,
      (d, name) => d.DonorName === name,
      (d) => d.EntityName,
      (d) => d.EntityName || '');

    helpers.fixateColors(filtered);

    let partition = d3.layout.partition()
      .value((d) => d.parent.donated)
      .sort((a, b) => d3.descending(a.parent.donated, b.parent.donated))
      .size([2 * Math.PI, 300]);

    let nodes = partition.nodes(tree);
    let arc = d3.svg.arc()
      .innerRadius((d) => d.y)
      .outerRadius((d) => d.depth ? d.y + d.dy / d.depth : 0);

    nodes = nodes.map((d) => {
      d.startAngle = d.x;
      d.endAngle = d.x + d.dx;

      return d;
    });

    nodes = nodes.filter((d) => d.depth);

    let chart = this.chart.attr('transform', `translate(${this.width / 2}, ${this.height / 2})`);

    let node = chart.selectAll('g')
      .data(nodes)
      .enter()
      .append('g');

    node.append('path')
    .classed('partition', true)
    .attr({
      d: arc,
      fill: (d) => helpers.color(d.name)
    });

    node.call(helpers.tooltip((d) => d.name, chart));

    require('./chapter5.css');
  }

  pack(filterString = ' MP') {
    let filtered = this.data.filter((d) => d.EntityName.match(filterString) );
    let tree = helpers.makeTree(filtered,
      (d, name) => d.DonorName === name,
      (d) => d.EntityName,
      (d) => d.EntityName || '');

    helpers.fixateColors(filtered);

    let pack = d3.layout.pack()
            .padding(5)
            .size([this.width / 1.5, this.height / 1.5])
            .value(function (d) { return d.parent.donated; });

    let nodes = pack.nodes(tree);

    this.chart.append('g')
      .attr('transform', 'translate(100, 100)')
      .selectAll('g')
      .data(nodes)
      .enter()
      .append('circle')
      .attr({
        r: (d) => d.r,
        cx: (d) => d.x,
        cy: (d) => d.y
      })
      .attr('fill', (d) => helpers.color(d.name))
      .call(helpers.tooltip((d) => d.name));
  }

  treemap(filterString = ' MP') {
    let filtered = this.data.filter((d) => d.EntityName.match(filterString) );
    let tree = helpers.makeTree(filtered,
      (d, name) => d.DonorName === name,
      (d) => d.EntityName,
      (d) => d.EntityName || '');

    helpers.fixateColors(filtered);

    let treemap = d3.layout.treemap()
      .size([this.width, this.height])
      .padding(3)
      .value((d) => d.parent.donated)
      .sort(d3.ascending);

    let nodes = treemap.nodes(tree)
      .filter((d) => d.depth);

    let node = this.chart.selectAll('g')
      .data(nodes)
      .enter()
      .append('g')
      .classed('node', true)
      .attr('transform', (d) => `translate(${d.x},${d.y})`);

    node.append('rect')
      .attr({
        width: (d) => d.dx,
        height: (d) => d.dy,
        fill: (d) => helpers.color(d.name)
      });
    console.dir(helpers.color.domain());
    let leaves = node.filter((d) => d.depth > 1);

    leaves.append('text')
      .text((d) => {
        let name = d.name.match(/([^\s]+\s[^\s]+) MP$/).shift().split(' ');
        return `${name[0].substr(0, 1)}. ${name[1]}`;
      })
      .attr('text-anchor', 'middle')
      .attr('transform', function (d) {
        let box = this.getBBox();
        let transform = `translate(${d.dx / 2},${d.dy / 2 + box.height / 2})`;
        if (d.dx < box.width && d.dx > box.height && d.dy > box.width) {
          transform += 'rotate(-90)';
        } else if (d.dx < box.width || d.dy < box.height) {
          d3.select(this).remove();
        }

        return transform;
      });

      leaves.call(helpers.tooltip((d) => d.parent.name, this.chart));

      leaves.on('mouseover', (d) => {
        let belongsTo = d.parent.name;
        console.log(d);
        this.chart.selectAll('.node')
          .transition()
          .style('opacity', (d) => {
            if (d.depth > 1 && d.parent.name !== belongsTo) {
              return 0.3;
            }

            if (d.depth == 1 && d.name !== belongsTo) {
              return 0.3;
            }

            return 1;
          });
      })
      .on('mouseout', () => {
        d3.selectAll('.node')
          .transition()
          .style('opacity', 1);
      })
      .on('click', (d) => alert(d.name));

    require('./chapter5.css');
  }
}
