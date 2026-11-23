// PDF 글자 층(pdf.js getTextContent)에서 논문 원문을 뽑는다: 줄 → 문단·절 제목 → 문장.
// pdf.js는 글자를 PDF에 적힌 순서(대개 사람이 읽는 순서, 2단이면 왼쪽 단 다음 오른쪽 단)로 준다.
// 그래서 줄을 다시 배치하지 않고 그 순서대로 묶기만 하면, 한 단·두 단이 섞인 쪽에서도 글이 섞이지 않는다.
// 문장마다 어느 글자 조각(item)의 몇 번째 글자부터 몇 번째까지인지도 함께 돌려줘서,
// 화면이 원본 PDF 위에 문장 상자를 정확히 그릴 수 있다(문라이트의 sentence-bbox와 같은 방식).
// 화면(paper.js)과 Node 검사 스크립트가 함께 쓰도록 바깥 의존이 없다.
"use strict";

var PaperExtract = (() => {
  /** 이 규칙의 판. 규칙을 바꾸면 올려서, 예전 판으로 뽑은 논문은 다시 뽑게 한다 */
  const VERSION = "pdfjs-2";

  // 문장 끝으로 보지 않는 약어 (마침표 앞 낱말, 소문자로)
  const ABBR = new Set([
    "al", "e.g", "i.e", "etc", "fig", "figs", "eq", "eqs", "ref", "refs", "vs", "cf", "approx", "no", "nos",
    "sec", "secs", "dr", "mr", "ms", "mrs", "prof", "st", "inc", "ltd", "co", "jr", "sr", "ca", "resp",
    "vol", "pp", "ed", "eds", "ch", "tab", "dept", "univ", "est", "min", "max", "avg", "approx", "incl",
  ]);

  const median = (arr) => {
    if (!arr.length) return 0;
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };

  /**
   * pages: [{ width, height, items: [{ str, transform, width, height, hasEOL }] }] (배율 1 기준)
   * 돌려주는 것: { version, title, blocks: [{ kind, level?, id?, sentences?, text? }], spans }
   *   spans: Map("문단id:문장번호" → [{ page, item, from, to }])  item은 그 쪽 items의 번호, from/to는 글자 위치
   */
  function run(pages) {
    // ── 1. 줄 만들기 ──
    const lines = [];
    pages.forEach((pg, p) => {
      let cur = null;
      const flush = () => {
        if (cur && cur.text.trim()) lines.push(cur);
        cur = null;
      };
      pg.items.forEach((it, idx) => {
        const [a, b, , , e, f] = it.transform;
        const rotated = Math.abs(b) > Math.abs(a) + 0.01; // 여백의 세로 글자(내려받은 곳 표시 등)
        const h = it.height || Math.hypot(it.transform[2], it.transform[3]) || 0;
        if (it.str) {
          if (cur && (cur.rotated !== rotated || Math.abs(cur.y - f) > Math.max(cur.size, h) * 0.6)) flush();
          if (!cur) cur = { page: p, text: "", x: e, y: f, right: e, size: h, sizes: [], rotated, parts: [] };
          cur.parts.push({ item: idx, at: cur.text.length, len: it.str.length });
          cur.text += it.str;
          cur.x = Math.min(cur.x, e);
          cur.right = Math.max(cur.right, e + (it.width || 0));
          // 줄 글자 크기는 글자·숫자가 든 조각으로만 잰다 (구분선·기호 글자는 높이가 엉뚱하다)
          if (/[A-Za-z0-9]/.test(it.str)) cur.sizes.push(h);
        }
        if (it.hasEOL) flush();
      });
      flush();
    });
    for (const l of lines) l.size = median(l.sizes) || l.size;

    // ── 2. 머리말·꼬리말·세로 글자 빼기 ──
    const band = (l) => {
      const H = pages[l.page].height;
      return l.y > H * 0.93 || l.y < H * 0.07;
    };
    const keyOf = (t) => t.toLowerCase().replace(/\d+/g, "#").replace(/\s+/g, " ").trim();
    const seen = new Map();
    for (const l of lines) {
      if (!band(l)) continue;
      const k = keyOf(l.text);
      if (!seen.has(k)) seen.set(k, new Set());
      seen.get(k).add(l.page);
    }
    const isPageNo = (t) => /^[\s\-–—|]*(page\s*)?\d{1,4}(\s*(of|\/)\s*\d{1,4})?[\s\-–—|]*$/i.test(t);
    const body = lines.filter((l) => {
      if (l.rotated) return false;
      if (band(l) && (isPageNo(l.text) || (seen.get(keyOf(l.text))?.size ?? 0) >= 3)) return false;
      return true;
    });

    // ── 3. 본문 글자 크기 ──
    const bodySize = median(body.flatMap((l) => Array(Math.min(20, Math.ceil(l.text.length / 10))).fill(l.size))) || 10;

    // ── 4. 절 제목 알아보기 ──
    const spacedCaps = (t) => /^([A-Z] ){2,}[A-Z]$/.test(t.trim());
    // "F I G U R E 1", "R E S E A R C H A R T I C L E"처럼 글자 사이를 벌려 쓴 대문자 낱말을 붙인다
    const unspace = (t) => t.replace(/\b(?:[A-Z] ){2,}[A-Z]\b/g, (m) => m.replace(/ /g, ""));
    const clean = (t) => unspace(t.trim());
    const NAMED = /^(abstract|keywords?|key words|key points|highlights|introduction|background|related work|methods?|materials and methods|results?|discussion|conclusions?|acknowledge?ments?|references|bibliography|appendix|funding( information)?|correspondence|author contributions|conflicts? of interest|data availability( statement)?|ethics statement|supplementary material)$/i;
    // 절 번호: "2.1 | Datasets", "3. Results"(각 자리 1~2자리, 0으로 시작 안 함 → "0.882 (…" 같은 본문 숫자는 제외)
    const numbered = (t) => /^([1-9]\d?(\.\d{1,2}){0,3})\s*[|.]?\s+[A-Z]/.exec(t.trim());
    // IEEE 꼴: "II. RELATED WORK"(로마 숫자 → 2단계), "A. Spindle Detection"(대문자 하나 → 3단계)
    const roman = (t) => /^(?:[IVX]{1,5})\.\s+[A-Z][A-Z ,\-&:]{2,}$/.test(t.trim());
    const lettered = (t) => /^[A-H]\.\s+[A-Z][\w\-][^.]{2,60}$/.test(t.trim());
    const allCaps = (t) => {
      const s = clean(t);
      return s.length >= 4 && s.length <= 60 && /^[A-Z0-9 &:,\-|()]+$/.test(s) && /[A-Z]{3}/.test(s);
    };
    const headingLevel = (l) => {
      const t = l.text.trim();
      if (t.length > 110) return 0;
      const m = numbered(t);
      if (m && t.length < 90 && !/[.:]$/.test(t)) return Math.min(2 + m[1].split(".").length - 1, 4);
      if (roman(t) && t.length < 70) return 2;
      if (lettered(t) && t.length < 70) return 3;
      if (l.size >= bodySize * 1.15 && t.length < 110) return 2;
      if (allCaps(t)) return 2;
      if (NAMED.test(clean(t))) return 2;
      return 0;
    };

    // ── 5. 문단 묶기 ──
    const blocks = []; // { kind, level, lines: [line] }
    let cur = null;
    const endsSentence = (t) => /[.!?:]["”’)\]]*(\[[\d,–\-\s]+\])?\d{0,3}\s*$/.test(t.trim());
    let titleDone = false;
    for (const l of body) {
      // 제목: 1쪽에서 가장 큰 글자의 줄들
      if (!titleDone && l.page === 0) {
        const maxSize = Math.max(...body.filter((x) => x.page === 0 && (x.text.match(/[A-Za-z]/g) ?? []).length >= 10).map((x) => x.size));
        if (l.size >= maxSize * 0.97 && l.size >= bodySize * 1.3 && (l.text.match(/[A-Za-z]/g) ?? []).length >= 3) {
          if (cur?.kind === "title") cur.lines.push(l);
          else blocks.push((cur = { kind: "title", level: 1, lines: [l] }));
          continue;
        }
        if (cur?.kind === "title") titleDone = true;
      }
      const lv = headingLevel(l);
      if (lv) {
        // 여러 줄로 이어지는 큰 제목은 하나로
        const last = cur?.lines[cur.lines.length - 1];
        if (cur?.kind === "heading" && !numbered(l.text) && !roman(l.text) && !lettered(l.text) && !NAMED.test(clean(l.text)) && l.page === last.page &&
            Math.abs(l.size - last.size) < 0.6 && last.y - l.y > 0 && last.y - l.y < last.size * 1.9 && cur.lines.length < 3) cur.lines.push(l);
        else blocks.push((cur = { kind: "heading", level: lv, lines: [l] }));
        continue;
      }
      const prev = cur?.kind === "para" ? cur.lines[cur.lines.length - 1] : null;
      let fresh = !prev;
      if (prev) {
        const gap = prev.y - l.y;                 // 아래로 내려가면 양수
        const lineGap = Math.max(prev.size, l.size) * 1.65;
        const sameColumn = prev.page === l.page && gap > 0 && gap < lineGap * 1.05 && Math.abs(l.x - prev.x) < prev.size * 8;
        const sizeJump = Math.abs(l.size - prev.size) > Math.max(l.size, prev.size) * 0.15;
        const caption = /^(fig(ure)?|table|tab\.)\s*\.?\s*\d+/i.test(l.text.trim());
        const prevShort = prev.right < cur.colRight - prev.size * 2.5;
        if (sizeJump || caption) fresh = true;
        else if (sameColumn) {
          const indent = l.x > prev.x + prev.size * 0.8;
          fresh = (indent || prevShort) && endsSentence(prev.text);
        } else {
          // 같은 쪽에서 겹치는 가로 자리의 위쪽으로 튀면 박스·각주 같은 별도 영역이라 새 문단으로 끊는다
          const sameColJumpUp = prev.page === l.page && gap < 0 && l.x < prev.right && prev.x < l.right;
          // 단이나 쪽이 바뀜: 앞 줄이 문장으로 끝나며 짧게 끝났으면 새 문단, 아니면 이어지는 글
          fresh = sameColJumpUp || (endsSentence(prev.text) && prevShort);
          if (!fresh && gap > 0 && prev.page === l.page && gap > lineGap * 1.6) fresh = endsSentence(prev.text);
        }
      }
      if (fresh) blocks.push((cur = { kind: "para", level: 0, lines: [l], colRight: l.right }));
      else { cur.lines.push(l); cur.colRight = Math.max(cur.colRight, l.right); }
    }

    // ── 5-1. 끊긴 문단 잇기 ──
    // 쪽이 넘어가거나 그림 설명·각주·머리말이 사이에 끼면 한 문단이 둘로 끊긴다. 앞 문단이 문장으로 끝나지 않고,
    // 뒤에 오는 본문 크기 문단이 소문자로 시작하면 이어 붙인다(사이에 낀 블록은 작은 글자·그림 설명·수식일 때만 건너뜀).
    const smallOrAside = (b) => b.kind !== "title" && (b.lines.every((x) => x.size < bodySize * 0.95) ||
      /^(fig(ure)?|table)\s*\.?\s*\d+/i.test(clean(b.lines[0].text)) || (b.kind === "heading" && isPageNo(b.lines[0].text)) ||
      b.lines.every((x) => (x.text.match(/[A-Za-z]/g) ?? []).length < 4));
    for (let i = 0; i < blocks.length; i++) {
      const a = blocks[i];
      if (a.kind !== "para") continue;
      const lastLine = a.lines[a.lines.length - 1].text.trim();
      if (endsSentence(lastLine)) continue;
      for (let j = i + 1; j < Math.min(blocks.length, i + 10); j++) {
        const b = blocks[j];
        const first = b.lines[0].text.trim();
        if (b.kind === "para" && Math.abs(b.lines[0].size - a.lines[0].size) < 0.6 && /^[a-z(]/.test(first)) {
          a.lines.push(...b.lines);
          blocks.splice(j, 1);
          i--; // 이어 붙인 뒤에도 또 끊겼을 수 있다
          break;
        }
        if (!smallOrAside(b)) break;
      }
    }

    // ── 6. 문단 글과 글자 위치표 ──
    const textOf = (blk) => {
      let text = "";
      const map = []; // 글자마다 { page, item, off } (줄 사이에 넣은 빈칸은 null)
      blk.lines.forEach((l, li) => {
        let t = l.text;
        let startCut = 0;
        // 줄 앞 공백은 버린다
        while (startCut < t.length && /\s/.test(t[startCut])) startCut++;
        if (li > 0) {
          if (/[A-Za-z]-$/.test(text) && /^[a-z]/.test(t.slice(startCut))) {
            text = text.slice(0, -1); // 줄 끝 하이픈으로 나뉜 낱말은 붙인다
            map.pop();
          } else if (!/\s$/.test(text)) {
            text += " ";
            map.push(null);
          }
        }
        for (let k = startCut; k < t.length; k++) {
          const part = l.parts.find((p) => k >= p.at && k < p.at + p.len);
          text += t[k];
          map.push(part ? { page: l.page, item: part.item, off: k - part.at } : null);
        }
      });
      // 끝 공백 정리 (map도 같이)
      while (text.length && /\s/.test(text[text.length - 1])) { text = text.slice(0, -1); map.pop(); }
      return { text, map };
    };

    // ── 7. 문장 나누기 ──
    const splitSentences = (text) => {
      const out = [];
      let start = 0;
      const re = /[.!?]["”’)]*(?:\[[\d,–\-\s]+\]|\d{1,3}(?:[,–\-]\d{1,3})*)?(\s+)(?=["“(]?[A-Z0-9])/g;
      let m;
      while ((m = re.exec(text))) {
        const dot = m.index;
        const before = text.slice(start, dot);
        const word = (/([A-Za-z.]+)$/.exec(before)?.[1] ?? "").toLowerCase();
        // 약어, 이니셜(A.), 소수점 숫자 다음은 문장 끝이 아니다
        if (ABBR.has(word.replace(/\.$/, "")) || /^[a-z]$/i.test(word) || /\d$/.test(before) && /^\d/.test(text.slice(dot + 1))) continue;
        const end = m.index + m[0].length - m[1].length; // 공백 앞까지
        if (end - start > 1) out.push([start, end]);
        start = m.index + m[0].length;
      }
      if (text.length - start > 0) out.push([start, text.length]);
      // 너무 짧은 조각(쪽 번호 같은)은 앞 문장에 붙인다
      return out.reduce((acc, r) => {
        if (acc.length && r[1] - r[0] < 4) acc[acc.length - 1][1] = r[1];
        else acc.push(r);
        return acc;
      }, []);
    };

    // ── 8. 결과: 참고문헌부터는 번역하지 않는 글 ──
    const result = [];
    const spans = new Map();
    let nextId = 0;
    let inRefs = false;
    let title = "";
    for (const blk of blocks) {
      const { text, map } = textOf(blk);
      if (!text) continue;
      if (blk.kind === "title") title = title ? `${title} ${text}` : text;
      const isRefsHead = blk.kind === "heading" && /^(\d+\s*[|.]?\s*)?(references|bibliography|literature cited)$/i.test(clean(text));
      if (isRefsHead) inRefs = true;
      else if (inRefs && blk.kind === "heading" && /^(appendix|supplementary(\s+(material|information))?)\b/i.test(clean(text))) inRefs = false;
      // 표 숫자처럼 숫자가 글자보다 많은 글은 번역하지 않는다
      const letters = (text.match(/[A-Za-z]/g) ?? []).length, digits = (text.match(/\d/g) ?? []).length;
      const tableLike = blk.kind === "para" && digits > letters * 0.6;
      const translatable = isRefsHead || (!inRefs && (blk.kind === "heading" || blk.kind === "title" || (!tableLike && /[A-Za-z]{3}/.test(text))));
      if (!translatable) {
        result.push({ kind: "static", text });
        continue;
      }
      const id = nextId++;
      const ranges = blk.kind === "para" ? splitSentences(text) : [[0, text.length]];
      const sentences = ranges.map(([s, e]) => clean(text.slice(s, e)));
      ranges.forEach(([s, e], i) => {
        const segs = [];
        for (let k = s; k < e; k++) {
          const c = map[k];
          if (!c) continue;
          const last = segs[segs.length - 1];
          if (last && last.page === c.page && last.item === c.item && last.to === c.off) last.to = c.off + 1;
          else segs.push({ page: c.page, item: c.item, from: c.off, to: c.off + 1 });
        }
        spans.set(`${id}:${i}`, segs);
      });
      if (blk.kind === "title") result.push({ kind: "heading", level: 1, id, sentences: [sentences.join(" ")] });
      else if (blk.kind === "heading") result.push({ kind: "heading", level: blk.level, id, sentences });
      else result.push({ kind: "para", id, sentences });
    }
    return { version: VERSION, title, blocks: result, spans };
  }

  return { VERSION, run };
})();

if (typeof module !== "undefined") module.exports = PaperExtract;
