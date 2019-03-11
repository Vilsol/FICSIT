import {AfterViewInit, Component, OnInit} from '@angular/core';
import {CalculatorService, Machine, Recipe, RecipeTree} from '../../../../services/calculator.service';
import {ActivatedRoute, Router} from '@angular/router';
import * as d3 from 'd3';

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

}
