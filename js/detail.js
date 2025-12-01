document.addEventListener('DOMContentLoaded', async () => {
    // 1. 获取 URL 参数
    const params = new URLSearchParams(window.location.search);
    const folder = params.get('folder');
    const year = params.get('year');

    if (!folder || !year) {
        alert("参数错误，无法加载数据");
        return;
    }

    document.getElementById('term-title').innerText = `${year}年 - ${folder} 详情数据`;

    // 2. 加载 CSV 数据
    const res = await fetch(`data/${year}/${folder}/daily.csv`);
    const text = await res.text();

    const dataStudy = [];

    text.trim().split('\n').forEach(line => {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 2) return;
        const [dateStr, study] = parts;

        // 转换日期为时间戳
        const timestamp = new Date(dateStr).getTime();
        dataStudy.push([timestamp, parseFloat(study)]);
    });

    renderCharts(dataStudy);
});

function renderCharts(data) {
    var options1 = {
        chart: {
            id: "chart2",
            type: "area",
            height: 400,
            foreColor: "#333",
            toolbar: { autoSelected: "pan", show: false }
        },
        colors: ["#FEB019"], // 黄色代表学习
        stroke: { width: 3 },
        dataLabels: { enabled: false },
        fill: { opacity: 1, type: 'solid' },
        markers: { size: 0 },
        series: [{ name: "学习时长", data: data }],
        xaxis: { type: "datetime" }
    };

    var options2 = {
        chart: {
            id: "chart1",
            height: 130,
            type: "area",
            brush: { target: "chart2", enabled: true },
            selection: {
                enabled: true,
                xaxis: {
                    // 默认选中最后 10 天
                    min: data[data.length - 10][0],
                    max: data[data.length - 1][0]
                }
            }
        },
        colors: ["#008FFB"],
        series: [{ data: data }],
        fill: { type: 'gradient', gradient: { opacityFrom: 0.91, opacityTo: 0.1 } },
        xaxis: { type: "datetime", tooltip: { enabled: false } },
        yaxis: { tickAmount: 2 }
    };

    new ApexCharts(document.querySelector("#chart-area"), options1).render();
    new ApexCharts(document.querySelector("#chart-brush"), options2).render();
}