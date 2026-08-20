/**
 * 中文数字/时间口语 → 书面数字（ITN，逆文本规范化），纯规则本地实现。
 * 只做高置信度的转换：百分比、钟点、带量词的数量、含千/万/亿的大数、连读数字串；
 * 单字数字（"一个"）与成语惯用语（"千万别"、"十分"）保持原样。
 */

const DIGIT: Record<string, number> = {
  零: 0,
  〇: 0,
  一: 1,
  幺: 1,
  二: 2,
  两: 2,
  兩: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
};

const MAG: Record<string, number> = { 十: 10, 百: 100, 千: 1000, 万: 10000, 萬: 10000, 亿: 100000000, 億: 100000000 };

/** 中文整数 → number；含口语缩略（两千五=2500、三万八=38000）。解析失败返回 null */
export function parseCnInt(s: string): number | null {
  if (!s) return null;
  let total = 0; // 已结算的亿/万段
  let section = 0; // 当前段（<万）
  let pendingDigit = -1; // 等待量级的数字
  let lastMag = 0; // 段内最近一次量级，用于口语缩略
  for (const ch of s) {
    if (ch in DIGIT) {
      if (DIGIT[ch] === 0) {
        lastMag = 0; // "零"只作分隔，且其后尾数是个位（一万零五=10005）
        continue;
      }
      if (pendingDigit >= 0) return null; // 连续两个数字（"三五"）不按数值解析
      pendingDigit = DIGIT[ch]!;
      continue;
    }
    const mag = MAG[ch];
    if (mag === undefined) return null;
    if (mag === 10000 || mag === 100000000) {
      section += pendingDigit >= 0 ? pendingDigit : 0;
      if (section === 0 && total === 0) return null; // "万"打头（"万一"）不是数
      total = (total + section) * mag;
      section = 0;
      pendingDigit = -1;
      lastMag = mag;
    } else {
      // 十/百/千："十"可省数字（十五=15）
      const d = pendingDigit >= 0 ? pendingDigit : mag === 10 ? 1 : -1;
      if (d < 0) return null;
      section += d * mag;
      pendingDigit = -1;
      lastMag = mag;
    }
  }
  if (pendingDigit >= 0) {
    // 尾数：常规个位（二十三=23）；口语缩略跟在 百/千/万/亿 后（两千五=2500）
    section += lastMag >= 100 ? pendingDigit * (lastMag / 10) : pendingDigit;
  }
  return total + section;
}

/** 数字部分的字符集：必须含量级或为多位连写，避免把"一个""两个"也转掉 */
const NUM_WITH_MAG = "(?:[一两兩二三四五六七八九零]?[十百千万萬亿億][零一两兩二三四五六七八九十百千万萬亿億]*|[一两兩二三四五六七八九][零一两兩二三四五六七八九]+)";

const UNITS =
  "(?:块钱|塊錢|块|塊|元|美元|年|个月|個月|号|號|日|周|週|次|岁|歲|倍|页|頁|楼|樓|层|層|米|公里|千米|公斤|千克|克|斤|吨|噸|秒|分钟|分鐘|小时|小時|天|人|条|條|张|張|只|隻|台|部|辆|輛|件|篇|字|个|個)";

function cnToDigits(s: string): string {
  return Array.from(s)
    .map((ch) => (ch in DIGIT ? String(DIGIT[ch]) : ch))
    .join("");
}

function fmt(n: number): string {
  return String(n);
}

/** 前面紧跟数字字时不得从中间开匹（四五十个、七八百这类概数整体跳过） */
const NOT_AFTER_NUM = "(?<![\u96f6\u3007\u4e00\u5e7a\u4e24\u5169\u4e8c\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341\u767e\u5343\u4e07\u842c\u4ebf\u5104])";

/** 中文口语数字 → 书面数字。只处理中文文本；转换失败的片段原样保留 */
export function applyItn(text: string): string {
  let out = text;

  // 百分之三点五 → 3.5%；前面紧跟数字（两千五百分之五十）属歧义句，整体保留
  out = out.replace(
    new RegExp(`${NOT_AFTER_NUM}(?<!\\d)百分之([零一两兩二三四五六七八九十百]+)(?:[点點]([零一二三四五六七八九]+))?`, "g"),
    (m, int: string, frac?: string) => {
    const n = parseCnInt(int);
    if (n === null) return m;
    return frac ? `${n}.${cnToDigits(frac)}%` : `${n}%`;
  });

  // 三点半/三点整/三点一刻/十点四十五分 → 3:30 / 3:00 / 3:15 / 10:45；
  // 小时也支持阿拉伯数字（SenseVoice 常直接出阿拉伯数字：3点半 → 3:30）
  out = out.replace(
    new RegExp(
      `${NOT_AFTER_NUM}(?<![\\d:.])([\u4e24\u5169\u4e8c\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d]|\u5341[\u4e00\u4e8c\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d]?|\u4e8c\u5341[\u4e00\u4e8c\u4e09\u56db]?|[01]?\\d|2[0-4])[\u70b9\u9ede](\u534a|\u6574|\u4e00\u523b|\u4e09\u523b|[\u96f6\u4e00\u4e24\u5169\u4e8c\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341]{1,3}\u5206|[0-5]?\\d\u5206)`,
      "g",
    ),
    (m, h: string, rest: string) => {
      const hour = /^\d+$/.test(h) ? Number(h) : parseCnInt(h);
      if (hour === null || hour > 24) return m;
      let minute: number | null = 0;
      if (rest === "半") minute = 30;
      else if (rest === "一刻") minute = 15;
      else if (rest === "三刻") minute = 45;
      else if (rest !== "整") {
        const body = rest.slice(0, -1);
        minute = /^\d+$/.test(body) ? Number(body) : parseCnInt(body);
      }
      if (minute === null || minute > 59) return m;
      return `${hour}:${String(minute).padStart(2, "0")}`;
    },
  );

  // 数量 + 量词：二十三岁 → 23岁、三千块 → 3000块
  out = out.replace(new RegExp(`${NOT_AFTER_NUM}(${NUM_WITH_MAG})(${UNITS})`, "g"), (m, num: string, unit: string) => {
    const n = parseCnInt(num);
    return n === null ? m : `${fmt(n)}${unit}`;
  });

  // 含千/万/亿的大数（可带口语尾数）：花了两千五 → 花了2500、三万八 → 38000
  out = out.replace(
    new RegExp(
      `${NOT_AFTER_NUM}[\u4e00\u4e24\u5169\u4e8c\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341]+[\u5343\u4e07\u842c\u4ebf\u5104][\u96f6\u4e00\u4e24\u5169\u4e8c\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5343\u767e\u5341\u4e07\u842c]*(?![\u96f6\u4e00\u4e8c\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341\u767e\u5343\u4e07\u842c\u4ebf\u5104\u5206])`,
      "g",
    ),
    (m) => {
      const n = parseCnInt(m);
      return n === null || n < 1000 ? m : fmt(n);
    },
  );

  // 连读数字串（手机号/验证码）：幺三八零零 → 13800
  out = out.replace(/[零〇一幺二三四五六七八九]{3,}(?![十百千万亿])/g, (m) => cnToDigits(m));

  return out;
}
