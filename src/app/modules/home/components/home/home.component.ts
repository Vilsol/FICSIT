import {AfterViewInit, Component} from '@angular/core';
import {CalculatorService, Machine, Recipe, RecipeTree} from '../../../../services/calculator.service';
import {ActivatedRoute, Router} from '@angular/router';
import * as d3 from 'd3';
import * as d3_sankey from 'd3-sankey';

const max_belt_mk = 6;

interface ChartTree {
  name: string;
  amount: number;
  recipe: Recipe;
  machine: Machine;
  craftSpeeds: { [s: string]: number; };
  moveSpeeds: { [s: string]: number; };
  children: ChartTree[];
}

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})
export class HomeComponent implements AfterViewInit {

  constructor(public calculatorService: CalculatorService,
              private router: Router,
              private route: ActivatedRoute) {
    const urlParams = new URLSearchParams(window.location.search);
    this.itemCount = (urlParams.has('itemCount') ? parseInt(urlParams.get('itemCount'), 10) : undefined) || this.itemCount;
    this.itemName = urlParams.get('itemName') || this.itemName;
  }

  private _itemCount = 1;
  private _itemName = 'Heavy Modular Frame';
  private initialized = false;

  get itemCount(): number {
    return this._itemCount;
  }

  set itemCount(value: number) {
    this._itemCount = value;
    this.updateSelected();
  }

  get itemName(): string {
    return this._itemName;
  }

  set itemName(value: string) {
    this._itemName = value;
    this.updateSelected();
  }

  ngAfterViewInit(): void {
    this.initialized = true;
    this.updateGraph(this.toChart(this.calculatorService.getRecipe(this.itemName, this.itemCount)));
    // this.sankey();
  }

  /*
  genTree(tree: RecipeTree, indent: number, prefix: string = ''): string {
    const outputs = Object.keys(tree.recipe.out).join(', ');
    let result = '  '.repeat(indent) + prefix + '[' + tree.machine.name + ']: ' + tree.times + 'x ' + outputs;
    tree.inputs.forEach(input => {
      const ips = input.times / tree.times;
      result += '\n' + this.genTree(input, indent + 1, 'Belt MK' + this.getRequiredBelt(ips) + ' of ' + ips + '/s ');
    });
    return result;
  }
  */

  toChart(tree: RecipeTree): ChartTree {
    return {
      name: Object.keys(tree.recipe.out).join(', '),
      amount: tree.times,
      recipe: tree.recipe,
      machine: tree.machine,
      craftSpeeds: {},
      moveSpeeds: {},
      children: tree.inputs.map(input => this.toChart(input))
    };
  }

  getBeltThroughput(tier: number): number {
    if (tier === 1) {
      return 60;
    }

    return 15 * (tier - 1) * (tier + 6);
  }

  getRequiredBelt(ips: number) {
    if (ips <= 1) {
      return 1;
    }

    return Math.ceil((-75 + Math.sqrt(11025 + 60 * (ips * 60))) / 30);
  }

  updateSelected() {
    if (!this.initialized) {
      return;
    }

    this.updateGraph(this.toChart(this.calculatorService.getRecipe(this.itemName, this.itemCount)));
    this.router.navigate(['.'], {
      relativeTo: this.route,
      queryParams: {
        itemName: this.itemName,
        itemCount: this.itemCount
      }
    });
  }

  updateGraph(data: ChartTree) {
    /*
    if (this.panZoom !== null) {
      this.panZoom.destroy();
      this.panZoom = null;
    }
    */

    const svg = d3.select('svg');

    svg.attr('height', window.innerHeight - 200);
    d3.select('#svgparent').attr('style', 'width: 100%; height:' + svg.attr('height') + 'px');
    svg.selectAll('*').remove();

    const tooltip = d3.select('#tooltip');
    const margin = {top: 20, right: 120, bottom: 20, left: 180};
    const width = (svg.node() as any).getBoundingClientRect().width;
    const height = parseInt(svg.attr('height'), 10) - margin.top - margin.bottom;

    svg.attr('viewBox', '0 0 ' + width + ' ' + svg.attr('height'));

    const g = svg.append('g').attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');
    const tree = d3.cluster()
      .size([height, width - 160]);

    const root = d3.hierarchy(data);

    tree(root);

    const link = g.selectAll('.link')
      .data(root.descendants().slice(1))
      .enter().append('path')
      .attr('class', d => {
        let classes = 'link';
        if (d.data.amount < 60) {
          classes += ' link-yellow';
        } else if (d.data.amount < 120) {
          classes += ' link-yellow link-bold';
        } else if (d.data.amount < 270) {
          classes += ' link-red';
        } else if (d.data.amount < 450) {
          classes += ' link-red link-bold';
        } else if (d.data.amount < 660) {
          classes += ' link-blue';
        } else {
          classes += ' link-blue link-bold';
        }
        return classes;
      })
      .attr('d', (d: any) => 'M' + (d.depth * 180) + ',' + d.x
        + 'C' + (d.parent.depth * 180 + 100) + ',' + d.x
        + ' ' + (d.parent.depth * 180 + 100) + ',' + d.parent.x
        + ' ' + (d.parent.depth * 180) + ',' + d.parent.x)
      .on('mouseover', d => {
        let html = 'Moving ' + d.data.amount + '/min<br>Requires:<br>';

        Object.keys(d.data.moveSpeeds).sort((a, b) => {
          return d.data.moveSpeeds[a] - d.data.moveSpeeds[b];
        }).forEach((belt) => {
          html += 'belt: ' + d.data.moveSpeeds[belt] + '<br>';
        });

        for (let i = 1; i <= max_belt_mk; i++) {
          html += 'MK' + i + ': ' + (d.data.amount / this.getBeltThroughput(i)).toFixed(2) + '<br>';
        }

        tooltip.transition()
          .duration(200)
          .style('opacity', .9);
        tooltip.html(html)
          .style('left', (d3.event.pageX) + 'px')
          .style('top', (d3.event.pageY - 28) + 'px');
      })
      .on('mouseout', () => {
        tooltip.transition()
          .duration(500)
          .style('opacity', 0);
      });

    const node = g.selectAll('.node')
      .data(root.descendants())
      .enter().append('g')
      .attr('class', d => 'node' + (d.children ? ' node--internal' : ' node--leaf'))
      .attr('transform', (d: any) => 'translate(' + (d.depth * 180) + ',' + d.x + ')')
      .on('mouseover', d => {
        let html = 'Processing ' + d.data.amount + '/min<br>Requires:<br>';

        Object.keys(d.data.craftSpeeds).sort((a, b) => {
          return d.data.craftSpeeds[a] - d.data.craftSpeeds[b];
        }).forEach((machine) => {
          html += 'machine: ' + d.data.craftSpeeds[machine] + '<br>';
        });

        html += d.data.machine.name + ': ';

        html += d.data.amount / (60 / d.data.recipe.duration);

        tooltip.transition()
          .duration(200)
          .style('opacity', .9);
        tooltip.html(html)
          .style('left', (d3.event.pageX) + 'px')
          .style('top', (d3.event.pageY - 28) + 'px');
      })
      .on('mouseout', d => {
        tooltip.transition()
          .duration(500)
          .style('opacity', 0);
      });

    node.append('circle')
      .attr('r', 7);

    // Text above the node
    node.append('text')
      .attr('dy', 3)
      .attr('x', d => d.children ? -8 : 8)
      .style('text-anchor', 'middle')
      .style('transform', d => d.children ? 'translate(6px, -15px)' : 'translate(-6px, -15px)')
      .text(d => d.data.name);

    // Text below the node
    node.append('text')
      .attr('dy', 3)
      .attr('x', d => d.children ? -8 : 8)
      .style('text-anchor', 'middle')
      .style('transform', d => d.children ? 'translate(6px, 17px)' : 'translate(-6px, 17px)')
      .text(d => d.data.amount + '/min');

    /*
    this.panZoom = svgPanZoom('#svg', {
      preventMouseEventsDefault: true,
      contain: true,
      dblClickZoomEnabled: true,
      zoomEnabled: true,
      maxZoom: 3,
      minZoom: 0.25,
      customEventsHandler: {
        haltEventListeners: ['touchstart', 'touchend', 'touchmove', 'touchleave', 'touchcancel'],
        init: function(options) {
          let instance = options.instance,
            initialScale = 1,
            pannedX = 0,
            pannedY = 0;
          this.hammer = Hammer(options.svgElement);
          this.hammer.get('pinch').set({enable: true});
          this.hammer.on('doubletap', function(ev) {
            instance.zoomIn();
          });
          this.hammer.on('panstart panmove touchstart touchmove', function(ev) {
            if (ev.type === 'panstart' || ev.type === 'touchstart') {
              pannedX = 0;
              pannedY = 0;
            }
            instance.panBy({x: ev.deltaX - pannedX, y: ev.deltaY - pannedY});
            pannedX = ev.deltaX;
            pannedY = ev.deltaY;
          });
          this.hammer.on('pinchstart pinchmove', function(ev) {
            if (ev.type === 'pinchstart') {
              initialScale = instance.getZoom();
              instance.zoom(initialScale * ev.scale);
            }
            instance.zoom(initialScale * ev.scale);
          });
          options.svgElement.addEventListener('touchmove', function(e) { e.preventDefault(); });
        }
        , destroy: function(options) {
          this.hammer.destroy();
        }
      }
    });
    this.panZoom.resize();
    this.panZoom.fit();
    this.panZoom.enablePan();
    window.myPanZoom = this.panZoom;
    const tempSvg = document.getElementById('svg');
    const tempG = tempSvg.firstElementChild;
    this.panZoom.zoom(Math.min(Math.min(width / tempG.getBBox().width, height / tempG.getBBox().height), 1));
    if (window.width <= 768) {
      this.panZoom.pan({
        x: tempSvg.getBoundingClientRect().left - tempG.getBoundingClientRect().left,
        y: tempSvg.getBoundingClientRect().top - tempG.getBoundingClientRect().top,
      });
    } else {
      this.panZoom.pan({
        x: -53,
        y: 0,
      });
    }
    */
  }

  sankey() {
    const edgeColor: string = 'output';
    const width = 1975;
    const height = 800;
    const data = {
      'nodes': [{'name': 'Agricultural \'waste\''}, {'name': 'Bio-conversion'}, {'name': 'Liquid'}, {'name': 'Losses'}, {'name': 'Solid'},
        {'name': 'Gas'}, {'name': 'Biofuel imports'}, {'name': 'Biomass imports'}, {'name': 'Coal imports'}, {'name': 'Coal'},
        {'name': 'Coal reserves'}, {'name': 'District heating'}, {'name': 'Industry'}, {'name': 'Heating and cooling - commercial'},
        {'name': 'Heating and cooling - homes'}, {'name': 'Electricity grid'}, {'name': 'Over generation / exports'},
        {'name': 'H2 conversion'}, {'name': 'Road transport'}, {'name': 'Agriculture'}, {'name': 'Rail transport'},
        {'name': 'Lighting & appliances - commercial'}, {'name': 'Lighting & appliances - homes'}, {'name': 'Gas imports'},
        {'name': 'Ngas'}, {'name': 'Gas reserves'}, {'name': 'Thermal generation'}, {'name': 'Geothermal'}, {'name': 'H2'},
        {'name': 'Hydro'}, {'name': 'International shipping'}, {'name': 'Domestic aviation'}, {'name': 'International aviation'},
        {'name': 'National navigation'}, {'name': 'Marine algae'}, {'name': 'Nuclear'}, {'name': 'Oil imports'}, {'name': 'Oil'},
        {'name': 'Oil reserves'}, {'name': 'Other waste'}, {'name': 'Pumped heat'}, {'name': 'Solar PV'}, {'name': 'Solar Thermal'},
        {'name': 'Solar'}, {'name': 'Tidal'}, {'name': 'UK land based bioenergy'}, {'name': 'Wave'}, {'name': 'Wind'}],
      'links': [{'source': 0, 'target': 1, 'value': 124.729}, {'source': 1, 'target': 2, 'value': 0.597}, {
        'source': 1,
        'target': 3,
        'value': 26.862
      }, {'source': 1, 'target': 4, 'value': 280.322}, {'source': 1, 'target': 5, 'value': 81.144}, {
        'source': 6,
        'target': 2,
        'value': 35
      }, {'source': 7, 'target': 4, 'value': 35}, {'source': 8, 'target': 9, 'value': 11.606}, {
        'source': 10,
        'target': 9,
        'value': 63.965
      }, {'source': 9, 'target': 4, 'value': 75.571}, {'source': 11, 'target': 12, 'value': 10.639}, {
        'source': 11,
        'target': 13,
        'value': 22.505
      }, {'source': 11, 'target': 14, 'value': 46.184}, {'source': 15, 'target': 16, 'value': 104.453}, {
        'source': 15,
        'target': 14,
        'value': 113.726
      }, {'source': 15, 'target': 17, 'value': 27.14}, {'source': 15, 'target': 12, 'value': 342.165}, {
        'source': 15,
        'target': 18,
        'value': 37.797
      }, {'source': 15, 'target': 19, 'value': 4.412}, {'source': 15, 'target': 13, 'value': 40.858}, {
        'source': 15,
        'target': 3,
        'value': 56.691
      }, {'source': 15, 'target': 20, 'value': 7.863}, {'source': 15, 'target': 21, 'value': 90.008}, {
        'source': 15,
        'target': 22,
        'value': 93.494
      }, {'source': 23, 'target': 24, 'value': 40.719}, {'source': 25, 'target': 24, 'value': 82.233}, {
        'source': 5,
        'target': 13,
        'value': 0.129
      }, {'source': 5, 'target': 3, 'value': 1.401}, {'source': 5, 'target': 26, 'value': 151.891}, {
        'source': 5,
        'target': 19,
        'value': 2.096
      }, {'source': 5, 'target': 12, 'value': 48.58}, {'source': 27, 'target': 15, 'value': 7.013}, {
        'source': 17,
        'target': 28,
        'value': 20.897
      }, {'source': 17, 'target': 3, 'value': 6.242}, {'source': 28, 'target': 18, 'value': 20.897}, {
        'source': 29,
        'target': 15,
        'value': 6.995
      }, {'source': 2, 'target': 12, 'value': 121.066}, {'source': 2, 'target': 30, 'value': 128.69}, {
        'source': 2,
        'target': 18,
        'value': 135.835
      }, {'source': 2, 'target': 31, 'value': 14.458}, {'source': 2, 'target': 32, 'value': 206.267}, {
        'source': 2,
        'target': 19,
        'value': 3.64
      }, {'source': 2, 'target': 33, 'value': 33.218}, {'source': 2, 'target': 20, 'value': 4.413}, {
        'source': 34,
        'target': 1,
        'value': 4.375
      }, {'source': 24, 'target': 5, 'value': 122.952}, {'source': 35, 'target': 26, 'value': 839.978}, {
        'source': 36,
        'target': 37,
        'value': 504.287
      }, {'source': 38, 'target': 37, 'value': 107.703}, {'source': 37, 'target': 2, 'value': 611.99}, {
        'source': 39,
        'target': 4,
        'value': 56.587
      }, {'source': 39, 'target': 1, 'value': 77.81}, {'source': 40, 'target': 14, 'value': 193.026}, {
        'source': 40,
        'target': 13,
        'value': 70.672
      }, {'source': 41, 'target': 15, 'value': 59.901}, {'source': 42, 'target': 14, 'value': 19.263}, {
        'source': 43,
        'target': 42,
        'value': 19.263
      }, {'source': 43, 'target': 41, 'value': 59.901}, {'source': 4, 'target': 19, 'value': 0.882}, {
        'source': 4,
        'target': 26,
        'value': 400.12
      }, {'source': 4, 'target': 12, 'value': 46.477}, {'source': 26, 'target': 15, 'value': 525.531}, {
        'source': 26,
        'target': 3,
        'value': 787.129
      }, {'source': 26, 'target': 11, 'value': 79.329}, {'source': 44, 'target': 15, 'value': 9.452}, {
        'source': 45,
        'target': 1,
        'value': 182.01
      }, {'source': 46, 'target': 15, 'value': 19.013}, {'source': 47, 'target': 15, 'value': 289.366}]
    };

    const colord3 = d3.scaleOrdinal(d3.schemeSet3);

    const color = (name: string) => {
      return colord3(name);
    };

    const format = (d) => {
      const f = d3.format(',.0f');
      return `${f(d)} TWh`;
    };

    const sankey = ({nodes, links}) => {
      const sankeyd3 = d3_sankey.sankey()
        .nodeAlign(d3_sankey[`sankeyJustify`])
        .nodeWidth(15)
        .nodePadding(10)
        .extent([[1, 5], [width - 1, height - 5]]);
      return sankeyd3({
        nodes: nodes.map(d => Object.assign({}, d as any)),
        links: links.map(d => Object.assign({}, d as any))
      });
    };

    const chart = () => {
      const svg = d3.select('#testsvg')
        .style('width', '100%')
        .style('height', 'auto');


      const {nodes, links} = sankey(data as any);

      svg.append('g')
        .attr('stroke', '#000')
        .selectAll('rect')
        .data(nodes)
        .join('rect')
        .attr('x', (d: any) => d.x0)
        .attr('y', (d: any) => d.y0)
        .attr('height', (d: any) => d.y1 - d.y0)
        .attr('width', (d: any) => d.x1 - d.x0)
        .attr('fill', (d: any) => color(d.name))
        .append('title')
        .text((d: any) => `${d.name}\n${format(d.value)}`);

      svg.attr('height', window.innerHeight - 200);

      const link = svg.append('g')
        .attr('fill', 'none')
        .attr('stroke-opacity', 0.5)
        .selectAll('g')
        .data(links)
        .join('g')
        .style('mix-blend-mode', 'multiply');

      link.append('path')
        .attr('d', d3_sankey.sankeyLinkHorizontal())
        .attr('stroke', (d: any) => color(d.target.name))
        .attr('stroke-width', (d: any) => Math.max(1, d.width));

      link.append('title')
        .text((d: any) => `${d.source.name} → ${d.target.name}\n${format(d.value)}`);

      svg.append('g')
        .style('font', '10px sans-serif')
        .selectAll('text')
        .data(nodes)
        .join('text')
        .attr('x', (d: any) => d.x0 < width / 2 ? d.x1 + 6 : d.x0 - 6)
        .attr('y', (d: any) => (d.y1 + d.y0) / 2)
        .attr('dy', '0.35em')
        .attr('text-anchor', (d: any) => d.x0 < width / 2 ? 'start' : 'end')
        .attr('class', (d: any) => 'node-text')
        .text((d: any) => d.name);

      return svg.node();
    };

    console.log(data);
    chart();
  }

}
