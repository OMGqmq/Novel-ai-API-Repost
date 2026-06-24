/**
 * X/Y Plot Manager Module
 * Manages input validation, parsing, and parameter override lists for matrix grid testing.
 */
export class XyPlotManager {
    constructor() {
        this.store = null;
    }

    bind(store) {
        this.store = store;
    }

    isEnabled() {
        const checkbox = document.getElementById('xyPlotEnabled');
        return checkbox ? checkbox.checked : false;
    }

    getXyConfigs() {
        const xTypeEl = document.getElementById('xyPlotXType');
        const xValEl = document.getElementById('xyPlotXValues');
        const yTypeEl = document.getElementById('xyPlotYType');
        const yValEl = document.getElementById('xyPlotYValues');

        const xType = xTypeEl ? xTypeEl.value : 'steps';
        const yType = yTypeEl ? yTypeEl.value : 'scale';

        const parseList = (str, type) => {
            return (str || '')
                .split(',')
                .map(item => item.trim())
                .filter(item => item !== '')
                .map(item => {
                    if (type === 'steps' || type === 'seed') {
                        const val = parseInt(item);
                        return isNaN(val) ? null : val;
                    } else {
                        const val = parseFloat(item);
                        return isNaN(val) ? null : val;
                    }
                })
                .filter(item => item !== null);
        };

        const xValues = (xType === 'none') ? [null] : (xValEl ? parseList(xValEl.value, xType) : [15, 20, 28]);
        const yValues = (yType === 'none') ? [null] : (yValEl ? parseList(yValEl.value, yType) : [5.0, 7.0, 9.0]);

        return {
            xType,
            xValues,
            yType,
            yValues
        };
    }

    generateParamGrid(baseParams) {
        const { xType, xValues, yType, yValues } = this.getXyConfigs();
        const grid = [];

        // Label translator for UI overlay
        const getLabel = (type) => {
            if (type === 'steps') return 'Steps';
            if (type === 'scale') return 'Scale';
            if (type === 'seed') return 'Seed';
            if (type === 'strength') return 'Strength';
            if (type === 'noise') return 'Noise';
            return type;
        };

        for (const yVal of yValues) {
            for (const xVal of xValues) {
                const params = { ...baseParams };

                // Apply overrides if not 'none'
                if (xType !== 'none' && xVal !== null) {
                    params[xType] = xVal;
                }
                if (yType !== 'none' && yVal !== null) {
                    params[yType] = yVal;
                }

                let xyInfo = '';
                if (xType !== 'none' && xVal !== null && yType !== 'none' && yVal !== null) {
                    xyInfo = `${getLabel(xType)}: ${xVal} | ${getLabel(yType)}: ${yVal}`;
                } else if (xType !== 'none' && xVal !== null) {
                    xyInfo = `${getLabel(xType)}: ${xVal}`;
                } else if (yType !== 'none' && yVal !== null) {
                    xyInfo = `${getLabel(yType)}: ${yVal}`;
                }

                grid.push({
                    params,
                    xyInfo: xyInfo || null
                });
            }
        }

        return grid;
    }
}
