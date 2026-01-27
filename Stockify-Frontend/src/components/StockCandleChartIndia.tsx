// import {
//   Chart as ChartJS,
//   LinearScale,
//   TimeScale,
//   TimeSeriesScale,
//   LineElement,
//   PointElement,
//   Tooltip
// } from "chart.js";
// import { Line } from "react-chartjs-2";
// import "chartjs-adapter-date-fns";

// ChartJS.register(
//   LinearScale,
//   TimeScale,
//   TimeSeriesScale,
//   LineElement,
//   PointElement,
//   Tooltip
// );

// /* =========================
//    MARKET TIME (IST)
// ========================= */
// const now = new Date();
// const istNow = new Date(
//   now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" })
// );

// const marketOpen = new Date(
//   istNow.getFullYear(),
//   istNow.getMonth(),
//   istNow.getDate(),
//   9, 15, 0
// ).getTime();

// const marketClose = new Date(
//   istNow.getFullYear(),
//   istNow.getMonth(),
//   istNow.getDate(),
//   15, 30, 0
// ).getTime();

// /* =========================
//    HOVER STATE
// ========================= */
// let hoverIndex: number | null = null;

// /* =========================
//    GROWW PLUGIN
// ========================= */
// const growwPlugin = {
//   id: "growwPlugin",

//   afterEvent(chart: any, args: any) {
//     const e = args.event;
//     if (e.type === "mousemove") {
//       const pts = chart.getElementsAtEventForMode(
//         e,
//         "index",
//         { intersect: false },
//         false
//       );
//       hoverIndex = pts.length ? pts[0].index : null;
//       chart.draw();
//     }
//     if (e.type === "mouseout") {
//       hoverIndex = null;
//       chart.draw();
//     }
//   },

//   afterDraw(chart: any) {
//     const meta = chart.getDatasetMeta(0);
//     if (!meta?.data?.length) return;

//     const idx = chart.options.plugins?.currentIndex;
//     if (idx == null) return;

//     const ctx = chart.ctx;
//     const { left, right, top, bottom } = chart.chartArea;

//     ctx.save();

//     /* current dot */
//     if (hoverIndex === null) {
//       const p = meta.data[idx];
//       ctx.beginPath();
//       ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
//       ctx.fillStyle = "#00b386";
//       ctx.fill();
//     }

//     /* hover */
//     if (hoverIndex !== null) {
//       const p = meta.data[hoverIndex];
//       ctx.beginPath();
//       ctx.moveTo(p.x, top);
//       ctx.lineTo(p.x, bottom);
//       ctx.strokeStyle = "rgba(0,0,0,0.25)";
//       ctx.stroke();
//     }

//     ctx.restore();
//   }
// };

// ChartJS.register(growwPlugin);

// /* =========================
//    TYPES
// ========================= */
// type LinePoint = { x: number; y: number };

// interface Props {
//   lineData: LinePoint[];
//   timeframe: string;
//   referencePrice?: number | null;
//   marketState?: string;
// }

// /* =========================
//    CHART
// ========================= */
// export default function StockChartIndia({
//   lineData,
//   timeframe,
//   marketState
// }: Props) {
//   const is1D = timeframe === "1D";
//   const isMarketOpen =
//     istNow.getTime() >= marketOpen && istNow.getTime() <= marketClose;
//   const isReplay = marketState === "REPLAY";

//   if (!lineData.length) {
//     return <div className="chart-container" />;
//   }

//   const currentIndex = lineData.length - 1;
//   const prices = lineData.map(d => d.y);
//   const min = Math.min(...prices);
//   const max = Math.max(...prices);
//   const pad = (max - min) * 0.08 || min * 0.002;

//   return (
//     <div className="chart-container">
//       <Line
//         data={{
//           datasets: [
//             {
//               data: lineData,
//               borderColor: "#00b386",
//               borderWidth: 3,
//               pointRadius: 0,
//               tension: is1D ? 0.05 : 0
//             }
//           ]
//         }}
//         options={{
//           animation: false,
//           maintainAspectRatio: false,
//           plugins: {
//             legend: { display: false },
//             tooltip: { enabled: false },
//             currentIndex
//           },
//           interaction: {
//             intersect: false,
//             mode: "index"
//           },
//           scales: {
//             x: {
//               type: "timeseries",
//               display: false,
//               min:
//                 is1D && isMarketOpen && !isReplay
//                   ? marketOpen
//                   : undefined,
//               max:
//                 is1D && isMarketOpen && !isReplay
//                   ? marketClose
//                   : undefined
//             },
//             y: {
//               display: false,
//               min: min - pad,
//               max: max + pad
//             }
//           }
//         }}
//       />
//     </div>
//   );
// }
