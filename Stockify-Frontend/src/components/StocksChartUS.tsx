// import {
//   Chart as ChartJS,
//   LinearScale,
//   TimeScale,
//   CategoryScale,
//   LineElement,
//   PointElement,
//   Tooltip
// } from "chart.js";
// import { Line } from "react-chartjs-2";
// import "chartjs-adapter-date-fns";

// /* =========================
//    REGISTER
// ========================= */
// ChartJS.register(
//   LinearScale,
//   TimeScale,
//   CategoryScale,
//   LineElement,
//   PointElement,
//   Tooltip
// );

// /* =========================
//    TYPES
// ========================= */
// type LinePoint = {
//   time: string; // ISO UTC
//   price: number;
// };

// interface Props {
//   lineData?: LinePoint[];
//   timeframe: string;
//   referencePrice?: number | null;
// }

// /* =========================
//    STOCK CHART US
// ========================= */
// export default function StockChartUS({
//   lineData,
//   timeframe,
//   referencePrice
// }: Props) {
//   if (!Array.isArray(lineData) || lineData.length === 0) {
//     return null;
//   }

//   const is1D = timeframe === "1D";

//   /* =====================
//      Y SCALE
//   ===================== */
//   const prices = lineData.map(d => d.price);
//   const minPrice = Math.min(...prices);
//   const maxPrice = Math.max(...prices);
//   const pad = (maxPrice - minPrice) * 0.08 || minPrice * 0.002;

//   /* =====================
//      US MARKET WINDOW (UTC)
//      9:00 AM → 5:00 PM ET
//   ===================== */

//   // Get today in New York date
//   const nyDate = new Date(
//     new Date().toLocaleString("en-US", {
//       timeZone: "America/New_York"
//     })
//   );

//   // 9:00 AM ET → 14:00 UTC
//   const marketStartUTC = new Date(
//     Date.UTC(
//       nyDate.getFullYear(),
//       nyDate.getMonth(),
//       nyDate.getDate(),
//       14, 0, 0
//     )
//   );

//   // 5:00 PM ET → 22:00 UTC
//   const marketEndUTC = new Date(
//     Date.UTC(
//       nyDate.getFullYear(),
//       nyDate.getMonth(),
//       nyDate.getDate(),
//       22, 0, 0
//     )
//   );

//   return (
//     <div className="chart-container">
//       <Line
//         data={{
//           datasets: [
//             {
//               data: lineData.map(d => ({
//                 x: new Date(d.time).getTime(),
//                 y: d.price
//               })),
//               borderColor: "#00b386",
//               borderWidth: 3,
//               pointRadius: 0,
//               tension: 0.05,
//               spanGaps: false // ✅ leave gaps empty
//             }
//           ]
//         }}
//         options={{
//           animation: false,
//           maintainAspectRatio: false,
//           plugins: {
//             legend: { display: false },
//             tooltip: { enabled: false },
//             referencePrice
//           },
//           interaction: {
//             intersect: false,
//             mode: "index"
//           },
//           scales: {
//             x: is1D
//               ? {
//                   type: "time",
//                   display: false,
//                   min: marketStartUTC.getTime(), // ✅ ALWAYS 9 AM
//                   max: marketEndUTC.getTime(),   // ✅ ALWAYS 5 PM
//                   time: {
//                     unit: "minute",
//                     stepSize: 5
//                   }
//                 }
//               : {
//                   type: "category",
//                   display: false
//                 },
//             y: {
//               display: false,
//               min: minPrice - pad,
//               max: maxPrice + pad
//             }
//           }
//         }}
//       />
//     </div>
//   );
// }
