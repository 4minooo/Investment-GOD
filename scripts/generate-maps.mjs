import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputFile = path.join(root, "src", "maps.js");

const HISTORY_DAYS = 60;
const FUTURE_DAYS = 20;
const MAP_COUNT = 100;
const START_DATE = "2015-01-01";
const END_DATE = "2026-08-14";

const STOCKS = [
  ["005930.KS", "삼성전자", "KOSPI", "반도체"],
  ["000660.KS", "SK하이닉스", "KOSPI", "반도체"],
  ["035420.KS", "NAVER", "KOSPI", "인터넷"],
  ["035720.KS", "카카오", "KOSPI", "인터넷"],
  ["005380.KS", "현대차", "KOSPI", "자동차"],
  ["000270.KS", "기아", "KOSPI", "자동차"],
  ["005490.KS", "POSCO홀딩스", "KOSPI", "철강"],
  ["051910.KS", "LG화학", "KOSPI", "화학"],
  ["006400.KS", "삼성SDI", "KOSPI", "2차전지"],
  ["068270.KS", "셀트리온", "KOSPI", "바이오"],
  ["011200.KS", "HMM", "KOSPI", "해운"],
  ["105560.KS", "KB금융", "KOSPI", "금융"],
  ["055550.KS", "신한지주", "KOSPI", "금융"],
  ["207940.KS", "삼성바이오로직스", "KOSPI", "바이오"],
  ["012330.KS", "현대모비스", "KOSPI", "자동차부품"],
  ["066570.KS", "LG전자", "KOSPI", "가전"],
  ["096770.KS", "SK이노베이션", "KOSPI", "에너지"],
  ["012450.KS", "한화에어로스페이스", "KOSPI", "방산"],
  ["034020.KS", "두산에너빌리티", "KOSPI", "기계"],
  ["003490.KS", "대한항공", "KOSPI", "항공"],
  ["090430.KS", "아모레퍼시픽", "KOSPI", "화장품"],
  ["036570.KS", "엔씨소프트", "KOSPI", "게임"],
  ["259960.KS", "크래프톤", "KOSPI", "게임"],
  ["011070.KS", "LG이노텍", "KOSPI", "전자부품"],
  ["017670.KS", "SK텔레콤", "KOSPI", "통신"],
  ["028260.KS", "삼성물산", "KOSPI", "지주"],
  ["011170.KS", "롯데케미칼", "KOSPI", "화학"],
  ["128940.KS", "한미약품", "KOSPI", "제약"],
  ["000990.KS", "DB하이텍", "KOSPI", "반도체"],
  ["326030.KS", "SK바이오팜", "KOSPI", "바이오"],
  ["010140.KS", "삼성중공업", "KOSPI", "조선"],
  ["042660.KS", "한화오션", "KOSPI", "조선"],
  ["009540.KS", "HD한국조선해양", "KOSPI", "조선"],
  ["047810.KS", "한국항공우주", "KOSPI", "방산"],
  ["316140.KS", "우리금융지주", "KOSPI", "금융"],
  ["086790.KS", "하나금융지주", "KOSPI", "금융"],
  ["032830.KS", "삼성생명", "KOSPI", "보험"],
  ["018260.KS", "삼성에스디에스", "KOSPI", "IT서비스"],
  ["377300.KS", "카카오페이", "KOSPI", "핀테크"],
  ["323410.KS", "카카오뱅크", "KOSPI", "금융"],
  ["247540.KQ", "에코프로비엠", "KOSDAQ", "2차전지"],
  ["086520.KQ", "에코프로", "KOSDAQ", "2차전지"],
  ["196170.KQ", "알테오젠", "KOSDAQ", "바이오"],
  ["028300.KQ", "HLB", "KOSDAQ", "바이오"],
  ["035900.KQ", "JYP Ent.", "KOSDAQ", "엔터"],
  ["041510.KQ", "에스엠", "KOSDAQ", "엔터"],
  ["263750.KQ", "펄어비스", "KOSDAQ", "게임"],
  ["293490.KQ", "카카오게임즈", "KOSDAQ", "게임"],
  ["096530.KQ", "씨젠", "KOSDAQ", "진단"],
  ["066970.KQ", "엘앤에프", "KOSDAQ", "2차전지"],
  ["278280.KQ", "천보", "KOSDAQ", "소재"],
  ["277810.KQ", "레인보우로보틱스", "KOSDAQ", "로봇"],
  ["237690.KQ", "에스티팜", "KOSDAQ", "제약"],
  ["141080.KQ", "리가켐바이오", "KOSDAQ", "바이오"],
  ["214450.KQ", "파마리서치", "KOSDAQ", "바이오"],
  ["058470.KQ", "리노공업", "KOSDAQ", "반도체"],
  ["357780.KQ", "솔브레인", "KOSDAQ", "소재"],
  ["403870.KQ", "HPSP", "KOSDAQ", "반도체"],
  ["290650.KQ", "엘앤씨바이오", "KOSDAQ", "바이오"],
  ["122870.KQ", "와이지엔터테인먼트", "KOSDAQ", "엔터"],
  ["035760.KQ", "CJ ENM", "KOSDAQ", "미디어"],
  ["009520.KQ", "포스코엠텍", "KOSDAQ", "철강"],
  ["005290.KQ", "동진쎄미켐", "KOSDAQ", "소재"],
  ["383310.KQ", "에코프로에이치엔", "KOSDAQ", "환경"],
  ["065350.KQ", "신성델타테크", "KOSDAQ", "전자부품"],
  ["086900.KQ", "메디톡스", "KOSDAQ", "바이오"],
  ["145020.KQ", "휴젤", "KOSDAQ", "바이오"],
  ["222800.KQ", "심텍", "KOSDAQ", "PCB"],
  ["067310.KQ", "하나마이크론", "KOSDAQ", "반도체"],
  ["095340.KQ", "ISC", "KOSDAQ", "반도체"],
  ["108320.KQ", "LX세미콘", "KOSDAQ", "반도체"],
  ["064760.KQ", "티씨케이", "KOSDAQ", "반도체"]
];

function toUnix(date) {
  return Math.floor(new Date(`${date}T00:00:00Z`).getTime() / 1000);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values) {
  const mean = average(values);
  return Math.sqrt(average(values.map((value) => (value - mean) ** 2)));
}

function maxDrawdown(closes) {
  let peak = closes[0] || 0;
  let drawdown = 0;
  for (const close of closes) {
    peak = Math.max(peak, close);
    if (peak > 0) {
      drawdown = Math.min(drawdown, close / peak - 1);
    }
  }
  return drawdown;
}

function normalizeRow(row, baseClose) {
  return [
    row.date,
    round((row.open / baseClose) * 100),
    round((row.high / baseClose) * 100),
    round((row.low / baseClose) * 100),
    round((row.close / baseClose) * 100),
    Math.round(row.volume || 0)
  ];
}

async function fetchStockRows(ticker) {
  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}`);
  url.searchParams.set("period1", String(toUnix(START_DATE)));
  url.searchParams.set("period2", String(toUnix(END_DATE)));
  url.searchParams.set("interval", "1d");
  url.searchParams.set("events", "history");

  const response = await fetch(url, {
    headers: {
      "User-Agent": "investment-god-map-generator/0.1"
    }
  });
  if (!response.ok) {
    throw new Error(`${ticker} fetch failed: ${response.status}`);
  }

  const payload = await response.json();
  const result = payload.chart?.result?.[0];
  const quote = result?.indicators?.quote?.[0];
  if (!result?.timestamp || !quote) return [];

  return result.timestamp
    .map((timestamp, index) => ({
      date: new Date(timestamp * 1000).toISOString().slice(0, 10),
      open: quote.open?.[index],
      high: quote.high?.[index],
      low: quote.low?.[index],
      close: quote.close?.[index],
      volume: quote.volume?.[index] || 0
    }))
    .filter((row) =>
      [row.open, row.high, row.low, row.close].every(
        (value) => typeof value === "number" && Number.isFinite(value) && value > 0
      )
    );
}

function classifyCandidate({ resultReturn, historyTrend, volatility, volumeRatio, drawdown }) {
  const classes = [];
  if (resultReturn >= 0.18) classes.push("surge");
  if (resultReturn <= -0.13) classes.push("crash");
  if (Math.abs(resultReturn) <= 0.045 && volatility <= 0.035) classes.push("sideways");
  if (
    (historyTrend >= 0.12 && resultReturn <= -0.08) ||
    (historyTrend <= -0.12 && resultReturn >= 0.1)
  ) {
    classes.push("fakeout");
  }
  if (volumeRatio >= 1.8 || Math.abs(drawdown) >= 0.22) classes.push("volume");
  return classes;
}

function categoryLabel(category) {
  return {
    surge: "대박 상승",
    crash: "폭락 회피",
    sideways: "박스권",
    fakeout: "속임수",
    volume: "거래량 힌트"
  }[category];
}

function scoreForCategory(candidate, category) {
  if (category === "surge") return candidate.resultReturn * 100 + candidate.volumeRatio * 3;
  if (category === "crash") return Math.abs(candidate.resultReturn) * 100 + Math.abs(candidate.drawdown) * 25;
  if (category === "sideways") return 20 - Math.abs(candidate.resultReturn) * 100 - candidate.volatility * 40;
  if (category === "fakeout") return Math.abs(candidate.historyTrend - candidate.resultReturn) * 100;
  return candidate.volumeRatio * 15 + Math.abs(candidate.drawdown) * 40 + Math.abs(candidate.resultReturn) * 20;
}

function difficulty(candidate) {
  const signal = Math.abs(candidate.resultReturn) + Math.abs(candidate.historyTrend) + candidate.volatility;
  if (signal < 0.14) return "상급";
  if (signal < 0.28) return "중급";
  return "초급";
}

function buildCandidates(rows, stock) {
  const [ticker, name, market, sector] = stock;
  const candidates = [];

  for (let decisionIndex = HISTORY_DAYS - 1; decisionIndex < rows.length - FUTURE_DAYS; decisionIndex += 7) {
    const history = rows.slice(decisionIndex - HISTORY_DAYS + 1, decisionIndex + 1);
    const future = rows.slice(decisionIndex + 1, decisionIndex + FUTURE_DAYS + 1);
    if (history.length !== HISTORY_DAYS || future.length !== FUTURE_DAYS) continue;

    const decisionClose = history.at(-1).close;
    const resultClose = future.at(-1).close;
    const baseClose = history[0].close;
    if (!decisionClose || !resultClose || !baseClose) continue;

    const historyCloses = history.map((row) => row.close);
    const returns = historyCloses
      .slice(1)
      .map((close, index) => close / historyCloses[index] - 1)
      .filter(Number.isFinite);
    const volumes = history.map((row) => row.volume || 0);
    const avgVolume = average(volumes.slice(0, -5));
    const volumeRatio = avgVolume > 0 ? average(volumes.slice(-5)) / avgVolume : 1;
    const resultReturn = resultClose / decisionClose - 1;
    const historyTrend = decisionClose / baseClose - 1;
    const drawdown = maxDrawdown(historyCloses);
    const volatility = standardDeviation(returns);

    const classes = classifyCandidate({
      resultReturn,
      historyTrend,
      volatility,
      volumeRatio,
      drawdown
    });
    if (!classes.length) continue;

    for (const category of classes) {
      candidates.push({
        ticker,
        name,
        market,
        sector,
        category,
        categoryLabel: categoryLabel(category),
        decisionIndex,
        startDate: history[0].date,
        decisionDate: history.at(-1).date,
        resultDate: future.at(-1).date,
        history,
        future,
        actualBuyPrice: decisionClose,
        actualSellPrice: resultClose,
        resultReturn,
        historyTrend,
        volumeRatio,
        drawdown,
        volatility,
        score: scoreForCategory(
          { resultReturn, historyTrend, volumeRatio, drawdown, volatility },
          category
        )
      });
    }
  }

  return candidates;
}

function selectCandidates(candidates) {
  const targetCategories = ["surge", "crash", "sideways", "fakeout", "volume"];
  const selected = [];
  const usedWindows = new Set();
  const perTickerCategoryCount = new Map();

  for (const category of targetCategories) {
    const categoryCandidates = candidates
      .filter((candidate) => candidate.category === category)
      .sort((a, b) => b.score - a.score);

    let added = 0;
    let relaxed = false;
    while (added < MAP_COUNT / targetCategories.length) {
      const candidate = categoryCandidates.find((item) => {
        const windowKey = `${item.ticker}:${item.decisionIndex}`;
        const nearWindowKey = `${item.ticker}:${Math.floor(item.decisionIndex / 35)}`;
        const tickerCategoryKey = `${item.ticker}:${category}`;
        const tickerCount = perTickerCategoryCount.get(tickerCategoryKey) || 0;
        if (usedWindows.has(windowKey) || usedWindows.has(nearWindowKey)) return false;
        return relaxed || tickerCount < 2;
      });

      if (!candidate) {
        if (!relaxed) {
          relaxed = true;
          continue;
        }
        break;
      }

      const windowKey = `${candidate.ticker}:${candidate.decisionIndex}`;
      const nearWindowKey = `${candidate.ticker}:${Math.floor(candidate.decisionIndex / 35)}`;
      const tickerCategoryKey = `${candidate.ticker}:${category}`;
      selected.push(candidate);
      usedWindows.add(windowKey);
      usedWindows.add(nearWindowKey);
      perTickerCategoryCount.set(tickerCategoryKey, (perTickerCategoryCount.get(tickerCategoryKey) || 0) + 1);
      categoryCandidates.splice(categoryCandidates.indexOf(candidate), 1);
      added += 1;
    }
  }

  if (selected.length < MAP_COUNT) {
    const remaining = candidates
      .filter((candidate) => !selected.includes(candidate))
      .sort((a, b) => b.score - a.score);
    for (const candidate of remaining) {
      if (selected.length >= MAP_COUNT) break;
      const windowKey = `${candidate.ticker}:${candidate.decisionIndex}`;
      if (usedWindows.has(windowKey)) continue;
      selected.push(candidate);
      usedWindows.add(windowKey);
    }
  }

  return selected.slice(0, MAP_COUNT);
}

function toMap(candidate, index) {
  const baseClose = candidate.history[0].close;
  return {
    id: `map-${String(index + 1).padStart(3, "0")}`,
    ticker: candidate.ticker.replace(/\.(KS|KQ)$/, ""),
    yahooSymbol: candidate.ticker,
    name: candidate.name,
    market: candidate.market,
    sector: candidate.sector,
    category: candidate.categoryLabel,
    difficulty: difficulty(candidate),
    startDate: candidate.startDate,
    decisionDate: candidate.decisionDate,
    resultDate: candidate.resultDate,
    returnPct: round(candidate.resultReturn * 100, 2),
    historyTrendPct: round(candidate.historyTrend * 100, 2),
    volumeSignal: round(candidate.volumeRatio, 2),
    drawdownPct: round(candidate.drawdown * 100, 2),
    actualBuyPrice: round(candidate.actualBuyPrice, 0),
    actualSellPrice: round(candidate.actualSellPrice, 0),
    history: candidate.history.map((row) => normalizeRow(row, baseClose)),
    future: candidate.future.map((row) => normalizeRow(row, baseClose))
  };
}

async function main() {
  const allCandidates = [];
  for (const stock of STOCKS) {
    try {
      const rows = await fetchStockRows(stock[0]);
      const candidates = buildCandidates(rows, stock);
      allCandidates.push(...candidates);
      console.log(`${stock[0]} ${stock[1]}: ${rows.length} rows, ${candidates.length} candidates`);
    } catch (error) {
      console.warn(error instanceof Error ? error.message : error);
    }
    await wait(260);
  }

  const selected = selectCandidates(allCandidates);
  if (selected.length < MAP_COUNT) {
    throw new Error(`Only selected ${selected.length} maps. Need ${MAP_COUNT}.`);
  }

  const maps = selected.map(toMap);
  await mkdir(path.dirname(outputFile), { recursive: true });
  const body = `export const MAP_DATA_SOURCE = ${JSON.stringify(
    {
      provider: "Yahoo Finance chart endpoint",
      generatedAt: new Date().toISOString(),
      historyDays: HISTORY_DAYS,
      futureDays: FUTURE_DAYS,
      note: "Actual Korean stock daily OHLCV data normalized for gameplay. Check data licensing before commercial/public-scale use."
    },
    null,
    2
  )};\n\nexport const MAPS = ${JSON.stringify(maps, null, 2)};\n`;

  await writeFile(outputFile, body, "utf8");
  console.log(`Wrote ${maps.length} maps to ${path.relative(root, outputFile)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
