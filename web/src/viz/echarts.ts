/**
 * Shared tree-shaken echarts entry (VIZ stack decision A, .planning/PROPOSAL-viz-interaction.md):
 * each chart registers only what it uses, so the workbench pays for radar now and
 * forest/gantt later — never the full echarts bundle. SVGRenderer (not canvas)
 * keeps chart geometry in the DOM for theme inheritance, crisp print and export.
 */
import { init, use } from 'echarts/core';
import { RadarChart } from 'echarts/charts';
import { AriaComponent, TooltipComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';

use([RadarChart, TooltipComponent, AriaComponent, SVGRenderer]);

export { init };
export type { EChartsType, EChartsCoreOption } from 'echarts/core';
