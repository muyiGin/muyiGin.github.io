document.addEventListener('DOMContentLoaded', init);

let globalConfig = null;
let chart = null;

// 数据缓存
let globalFunMap = {};
let globalAchvMap = {};
let globalWeeklyData = {};
let weekToTermMap = {};

async function init() {
    const closeBtn = document.getElementById('close-modal');
    const overlay = document.getElementById('modal-overlay');
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (overlay) overlay.addEventListener('click', (e) => {
        if (e.target.id === 'modal-overlay') closeModal();
    });

    // 悬浮联动
    document.addEventListener('mouseover', function (e) {
        const target = e.target.closest('.apexcharts-xaxis-label');
        if (target) {
            target.classList.add('active-term-label');
        }
    });

    document.addEventListener('mouseout', function (e) {
        const target = e.target.closest('.apexcharts-xaxis-label');
        if (target) {
            target.classList.remove('active-term-label');
        }
    });

    try {
        const res = await fetch('data/config.json');
        globalConfig = await res.json();
        loadYearData(globalConfig.currentYear);
    } catch (e) {
        console.error("无法加载配置文件", e);
        document.getElementById('year-summary').innerText = "配置加载失败，请检查 data/config.json";
    }
}

async function loadYearData(year) {
    const periods = globalConfig[year];
    if (!periods) return;

    // 清空全局缓存
    globalFunMap = {};

    buildWeekToTermMap(periods, year);
    await loadGlobalFunData(year);

    let weeklyData = {};
    let totalStudy = 0, totalWaste = 0, totalFun = 0;

    // 遍历学期加载数据
    for (let p of periods) {
        try {
            await loadAchvData(year, p.folder);
            const res = await fetch(`data/${year}/${p.folder}/daily.csv`);
            if (!res.ok) continue;
            const text = await res.text();

            const termStartWeek = getWeekNumber(parseDate(p.start));

            text.trim().split('\n').forEach(line => {
                const parts = line.trim().split(/\s+/);
                if (parts.length < 4) return;

                const relWeek = parseInt(parts[0]);
                const study = parseFloat(parts[1]) || 0;
                const fun = parseFloat(parts[2]) || 0;
                const waste = parseFloat(parts[3]) || 0;

                const absWeek = termStartWeek + relWeek - 1;

                if (!weeklyData[absWeek]) weeklyData[absWeek] = { study: 0, waste: 0, fun: 0 };

                weeklyData[absWeek].study = study;
                weeklyData[absWeek].waste = waste;
                weeklyData[absWeek].fun = fun;

                totalStudy += study; totalWaste += waste; totalFun += fun;
            });
        } catch (e) { }
    }

    globalWeeklyData = weeklyData;

    // 准备图表数据
    const maxWeek = 52;
    const labelColors = [];
    const seriesStudy = [], seriesWaste = [], seriesFun = [];

    // 平均值计算变量
    let currentTermId = null;
    let termAccumulatedStudy = 0;
    let termWeeksCount = 0;
    let minDataValue = 0;

    for (let i = 1; i <= maxWeek; i++) {
        const termInfo = weekToTermMap[i];

        // 检测学期切换
        let thisWeekTermId = termInfo ? termInfo.termId : 'unknown_term';
        if (thisWeekTermId !== currentTermId) {
            currentTermId = thisWeekTermId;
            termAccumulatedStudy = 0;
            termWeeksCount = 0;
        }

        if (termInfo) {
            labelColors.push(termInfo.color);
        } else {
            labelColors.push('#ccc');
            // 如果该周不属于任何配置的学期，也视为新阶段重置
            if (currentTermId !== 'unknown') {
                currentTermId = 'unknown';
                termAccumulatedStudy = 0;
                termWeeksCount = 0;
            }
        }

        if (!weeklyData[i]) {
            weeklyData[i] = { study: 0, waste: 0, fun: 0 };
        }
        const d = weeklyData[i];

        // 计算本阶段平均值
        if (d.study > 0 || d.waste > 0 || d.fun > 0) {
            termAccumulatedStudy += d.study;
            termWeeksCount++;
            d.termAverage = (termAccumulatedStudy / termWeeksCount).toFixed(1);
        }

        seriesStudy.push({ x: i, y: d.study });
        seriesWaste.push({ x: i, y: d.waste });
        seriesFun.push({ x: i, y: -Math.abs(d.fun) });

        if (-Math.abs(d.fun) < minDataValue) minDataValue = -Math.abs(d.fun);
    }

    const yMax = 80;
    const yMin = Math.floor(minDataValue / 20) * 20;
    const tickAmount = (yMax - yMin) / 20;

    updateSummary(totalStudy, totalWaste, totalFun);
    renderChart(labelColors, seriesStudy, seriesWaste, seriesFun, periods, year, yMin, yMax, tickAmount);
}

function renderChart(labelColors, sStudy, sWaste, sFun, periods, currentYear, yMin, yMax, tickAmount) {
    const options = {
        series: [
            { name: '学习', data: sStudy },
            { name: '浪费', data: sWaste },
            { name: '娱乐', data: sFun }
        ],
        chart: {
            type: 'bar',
            height: '100%',
            stacked: true,
            toolbar: { show: false },
            zoom: { enabled: false },
            selection: { enabled: false },
            events: {
                dataPointSelection: function (event, chartContext, config) {
                    const dataPoint = config.w.config.series[0].data[config.dataPointIndex];
                    if (dataPoint) {
                        openModal(dataPoint.x, currentYear);
                    }
                }
            }
        },
        colors: ['#FEB019', '#775DD0', '#00E396'],
        plotOptions: {
            bar: {
                columnWidth: '85%',
                borderRadius: 0
            },
        },
        dataLabels: { enabled: false },
        fill: { opacity: 1 },
        // 🌟 修复图例重叠问题
        legend: {
            position: 'bottom',
            offsetY: 10,      // 往下推 10px
            itemMargin: {
                horizontal: 10,
                vertical: 20  // 增加垂直间距
            }
        },
        yaxis: {
            min: yMin,
            max: yMax,
            tickAmount: tickAmount,
            forceNiceScale: false,
            title: { text: '小时 (Hours)' },
            labels: { formatter: (val) => Math.abs(val).toFixed(0) }
        },
        xaxis: {
            type: 'numeric',
            min: 0.5,
            max: 52.5,
            tickAmount: 52,
            axisBorder: { show: true, color: '#333' },
            axisTicks: { show: true, height: 6, color: '#333' },
            labels: {
                style: {
                    colors: labelColors,
                    fontSize: '14px',
                    fontWeight: 700,
                    fontFamily: 'Segoe UI, sans-serif'
                },
                offsetY: 0,
                formatter: function (val) {
                    const absWeek = Math.round(val);
                    const termInfo = weekToTermMap[absWeek];
                    return termInfo ? termInfo.relativeWeek : '';
                }
            },
            tooltip: { enabled: false }
        },
        tooltip: {
            shared: true,
            intersect: false,
            custom: function ({ series, seriesIndex, dataPointIndex, w }) {
                const dataPoint = w.config.series[0].data[dataPointIndex];
                if (!dataPoint) return '';

                const absWeek = dataPoint.x;
                const termInfo = weekToTermMap[absWeek];
                const d = globalWeeklyData[absWeek] || { study: 0, waste: 0, fun: 0 };
                const achvs = globalAchvMap[absWeek] || [];
                const funs = globalFunMap[absWeek] || [];

                const dateObj = new Date(currentYear, 0, 1);
                const offset = (dateObj.getDay() || 7) - 1;
                dateObj.setDate(dateObj.getDate() + (absWeek - 1) * 7 - offset);
                const startStr = `${dateObj.getMonth() + 1}/${dateObj.getDate()}`;
                dateObj.setDate(dateObj.getDate() + 6);
                const endStr = `${dateObj.getMonth() + 1}/${dateObj.getDate()}`;

                let title = `第 ${absWeek} 周`;
                let titleColor = '#333';
                if (termInfo) {
                    title = `${termInfo.termName} - 第 ${termInfo.relativeWeek} 周`;
                    titleColor = termInfo.color;
                }

                let html = `
                    <div class="custom-tooltip">
                        <div class="tooltip-header" style="color: ${titleColor}">
                            ${title} <span style="font-size:0.8em; color:#999; font-weight:normal">(${startStr} ~ ${endStr})</span>
                        </div>
                        <div class="tooltip-stats">
                            <span style="color:#FEB019">📚 学习: ${d.study}h</span>
                            <span style="color:#775DD0">🚽 浪费: ${d.waste}h</span>
                            <span style="color:#00E396">🎮 娱乐: ${d.fun}h</span>
                        </div>
                `;

                if (d.termAverage) {
                    html += `<div style="padding:0 5px 8px; font-size:0.85rem; color:#555; font-weight:bold; border-bottom: 1px solid #eee; margin-bottom:5px;">
                        📈 本阶段周均学习: <span style="color:#FEB019">${d.termAverage}h</span>
                    </div>`;
                }

                if (achvs.length > 0) {
                    html += `
                        <div class="tooltip-section">
                            <h4>🏆 本周成就</h4>
                            <ul class="tooltip-list">
                                ${achvs.join('')}
                            </ul>
                        </div>
                    `;
                }

                if (funs.length > 0) {
                    html += `
                        <div class="tooltip-section">
                            <h4>🎮 娱乐记录</h4>
                            <ul class="tooltip-list">
                                ${funs.join('')}
                            </ul>
                        </div>
                    `;
                }

                html += `</div>`;
                return html;
            }
        },
        // 🌟 修复图例重叠：增加底部 Padding
        grid: {
            borderColor: '#f1f1f1',
            xaxis: { lines: { show: false } },
            padding: {
                bottom: 40 // 留出 40px 给图例
            }
        }
    };

    if (chart) chart.destroy();
    chart = new ApexCharts(document.querySelector("#chart-container"), options);
    chart.render();
}

// 辅助函数
function buildWeekToTermMap(periods, year) {
    weekToTermMap = {};
    const firstPeriodStart = parseDate(periods[0].start);
    const startOfFirstPeriodWeek = getWeekNumber(firstPeriodStart);
    for (let w = 1; w < startOfFirstPeriodWeek; w++) {
        weekToTermMap[w] = {
            termName: "寒假(续)", termId: "winter_vacation_prev", folder: "WT_vac",
            color: "#008FFB", relativeWeek: w, year: year
        };
    }
    periods.forEach(p => {
        const startWeek = getWeekNumber(parseDate(p.start));
        const endWeek = getWeekNumber(parseDate(p.end));
        let relWeek = 1;
        for (let w = startWeek; w <= endWeek; w++) {
            if (!weekToTermMap[w]) {
                weekToTermMap[w] = {
                    termName: p.name, termId: p.id, folder: p.folder, color: p.color,
                    relativeWeek: relWeek++, year: year
                };
            }
        }
    });
}

function parseDate(dateStr) {
    if (!dateStr) return new Date();
    const parts = dateStr.replace(/\//g, '-').split('-');
    return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
}

function getWeekNumber(d) {
    d = new Date(d.valueOf());
    const year = d.getFullYear();
    const startOfYear = new Date(year, 0, 1);
    const diff = d - startOfYear;
    const oneDay = 1000 * 60 * 60 * 24;
    const dayOfYear = Math.floor(diff / oneDay);
    const dayOfWeek = startOfYear.getDay() || 7;
    const offset = dayOfWeek - 1;
    return Math.floor((dayOfYear + offset) / 7) + 1;
}

async function loadGlobalFunData(year) {
    try {
        const res = await fetch(`data/fun.txt`);
        if (res.ok) {
            const text = await res.text();
            text.trim().split('\n').forEach(line => {
                line = line.trim();
                if (!line) return;
                const match = line.match(/^([0-9\/\-]+)\s+\[(.*?)\]\s*(.+?)(?:\s+(\d+))?$/);
                if (match) {
                    const [_, dateStr, type, name, score] = match;
                    const date = parseDate(dateStr);
                    if (date.getFullYear() !== year) return;
                    const weekNum = getWeekNumber(date);
                    if (!globalFunMap[weekNum]) globalFunMap[weekNum] = [];
                    const html = `<li>
                        <span class="tag ${type}">${type}</span>
                        ${name} 
                        ${score ? '<span style="color:#f1c40f">★' + score + '</span>' : ''}
                        <span style="font-size:0.8em; color:#bbb; margin-left:5px">(${date.getMonth() + 1}/${date.getDate()})</span>
                    </li>`;
                    globalFunMap[weekNum].push(html);
                }
            });
        }
    } catch (e) { }
}

async function loadAchvData(year, folder) {
    try {
        const res = await fetch(`data/${year}/${folder}/achv.txt`);
        if (res.ok) {
            const text = await res.text();
            let currentWeekNum = null;
            text.trim().split('\n').forEach(line => {
                line = line.trim();
                if (!line) return;
                const dateMatch = line.match(/[(\uff08](\d{1,2}[\/\-]\d{1,2})/);
                if (dateMatch) {
                    const dateStr = `${year}/${dateMatch[1]}`;
                    currentWeekNum = getWeekNumber(parseDate(dateStr));
                    if (!globalAchvMap[currentWeekNum]) globalAchvMap[currentWeekNum] = [];
                } else if (currentWeekNum) {
                    globalAchvMap[currentWeekNum].push(`<li class="achv-item">${line}</li>`);
                }
            });
        }
    } catch (e) { }
}

function updateSummary(study, waste, fun) {
    const total = study + waste + fun;
    if (total === 0) return;
    const studyPct = ((study / total) * 100).toFixed(1);
    const funPct = ((fun / total) * 100).toFixed(1);
    document.getElementById('year-summary').innerHTML =
        `共记录 <b>${total.toFixed(0)}</b> 小时，其中学习占 <b>${studyPct}%</b>，娱乐占 <b>${funPct}%</b>`;
}

function openModal(weekNum, year) {
    const modal = document.getElementById('modal-overlay');
    const title = document.getElementById('modal-title');
    const dateRange = document.getElementById('modal-date-range');
    const achvList = document.getElementById('modal-achv-list');
    const funList = document.getElementById('modal-fun-list');

    const termInfo = weekToTermMap[weekNum];
    if (termInfo) {
        title.innerHTML = `<span style="color:${termInfo.color}">● ${termInfo.termName}</span> 第 ${termInfo.relativeWeek} 周`;
    } else {
        title.innerText = `第 ${weekNum} 周`;
    }

    const d = new Date(year, 0, 1);
    const offset = (d.getDay() || 7) - 1;
    const daysToAdd = (weekNum - 1) * 7 - offset;
    d.setDate(d.getDate() + daysToAdd);
    const startStr = `${d.getMonth() + 1}/${d.getDate()}`;
    const dEnd = new Date(d);
    dEnd.setDate(d.getDate() + 6);
    const endStr = `${dEnd.getMonth() + 1}/${dEnd.getDate()}`;
    dateRange.innerText = `${startStr} ~ ${endStr}`;

    const achvData = globalAchvMap[weekNum];
    achvList.innerHTML = (achvData && achvData.length > 0) ? `<ul>${achvData.join('')}</ul>` : `<div style="text-align:center; color:#999; margin-top:20px">本周没有记录成就</div>`;

    const funData = globalFunMap[weekNum];
    funList.innerHTML = (funData && funData.length > 0) ? `<ul>${funData.join('')}</ul>` : `<div style="text-align:center; color:#999; margin-top:20px">本周没有娱乐记录</div>`;

    modal.classList.remove('hidden');
}

function closeModal() {
    document.getElementById('modal-overlay').classList.add('hidden');
}