// node_modules의 렌더링 라이브러리를 src/vendor로 복사한다 (런타임에 네트워크를 쓰지 않음).
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const out = "src/vendor";
rmSync(out, { recursive: true, force: true });

const copies = [
  ["node_modules/katex/dist/katex.min.js", `${out}/katex/katex.min.js`],
  ["node_modules/katex/dist/katex.min.css", `${out}/katex/katex.min.css`],
  ["node_modules/katex/dist/fonts", `${out}/katex/fonts`],
  ["node_modules/mermaid/dist/mermaid.min.js", `${out}/mermaid/mermaid.min.js`],
  ["node_modules/@highlightjs/cdn-assets/highlight.min.js", `${out}/hljs/highlight.min.js`],
  // Pretendard: 쓰는 글자 묶음만 내려받는 dynamic subset (CSP상 CDN을 쓸 수 없어 앱에 포함)
  ["node_modules/pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css", `${out}/pretendard/pretendard.css`],
  ["node_modules/pretendard/dist/web/variable/woff2-dynamic-subset", `${out}/pretendard/woff2-dynamic-subset`],
  // pdf.js: 원본 PDF 보기. 동아시아 글꼴 표(cmaps)와 PDF 기본 글꼴(standard_fonts)도 함께 넣는다
  ["node_modules/pdfjs-dist/build/pdf.min.mjs", `${out}/pdfjs/pdf.min.mjs`],
  ["node_modules/pdfjs-dist/build/pdf.worker.min.mjs", `${out}/pdfjs/pdf.worker.min.mjs`],
  ["node_modules/pdfjs-dist/cmaps", `${out}/pdfjs/cmaps`],
  ["node_modules/pdfjs-dist/standard_fonts", `${out}/pdfjs/standard_fonts`],
  ["node_modules/pdfjs-dist/LICENSE", `${out}/pdfjs/LICENSE`],
];

for (const [from, to] of copies) {
  mkdirSync(to.substring(0, to.lastIndexOf("/")), { recursive: true });
  cpSync(from, to, { recursive: true });
}
console.log("vendor 복사 완료 →", out);

// ── 토스페이스(이모지 글꼴) ──
// npm에 없어 공식 저장소의 v1.6.1 원본을 받아 둔다. 처음 한 번만 받고(node_modules/.cache), 해시로 원본인지 확인한다.
// 라이선스(https://toss.im/tossface/copyright)에 따라 파일은 고치지 않고, 저작권 안내와 라이선스 전문을 함께 넣는다.
// 자세한 조건은 licenses/tossface/NOTICE.md
// 브라우저는 tossface.css의 woff2만 쓰므로 같은 내용의 woff는 넣지 않는다.
const TOSSFACE_URL = "https://cdn.jsdelivr.net/gh/toss/tossface@v1.6.1";
const TOSSFACE_FILES = {
  "LICENSE": "cb3222be7ac066105b35f5b44d4895ae5262bf1492ccfbc1b1e5d0e9db8f7861",
  "dist/tossface.css": "aa1d2fd5dd9877867625c1128aaa26551ac4aa953e55c200bd4cc8a80fdb9722",
  "dist/TossFaceFontMac-00.woff2": "7a74f09987fb5a11db72394be06a5e9161440e2be8372588d51d7f478ade1b99",
  "dist/TossFaceFontMac-01.woff2": "1bdc414d8e98c6388b7317eff26f841f59b837bc6895be9626cc2c4adbf53bf4",
  "dist/TossFaceFontMac-02.woff2": "e19c68f41c6c60bfdae7b91f9d4bea06f4d1f7d77f7d62ca8a8e4f56b9b5c612",
  "dist/TossFaceFontMac-03.woff2": "7cf3b62a3bf8a7711bac085e5869806e4d616fd01e4378b71b31a51fd93dc86b",
  "dist/TossFaceFontMac-04.woff2": "bdc766108207b1e70ac60861f822fda483fda8a6ee907affa1d4e101bed00a3c",
  "dist/TossFaceFontMac-05.woff2": "b7a719167d3168bfd625f8b588cfd48cb70a67e9357ca209d35025434f1d979f",
  "dist/TossFaceFontMac-06.woff2": "34c0f365b8c76b0f93763d7c0bb8a4df76130367790cc2b9087936ba339a1f49",
  "dist/TossFaceFontMac-07.woff2": "2ed1fbfa9911e6b660e30bc161e227004cd5b64059bee91f2ef7396454598a46",
  "dist/TossFaceFontMac-08.woff2": "71cc01dd972da6662b30b5a38300a94d2d9167f183128adba204838ee92ecf4f",
  "dist/TossFaceFontMac-09.woff2": "edd63102886c65e1a0c7a81c340dd544b22a63d6fa1fde0817f35344bd72df54",
  "dist/TossFaceFontMac-10.woff2": "73da782cab13a3b961243078bb125fb8be925bafa6a7e60ad64116788c5d3d9e",
  "dist/TossFaceFontMac-11.woff2": "b7fcd2bb309f3cc9b3deeeb4123390aca4913d38469e101a71089dca299b62dc",
};
const cache = "node_modules/.cache/tossface-1.6.1";
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
mkdirSync(cache, { recursive: true });
mkdirSync(`${out}/tossface`, { recursive: true });
for (const [file, hash] of Object.entries(TOSSFACE_FILES)) {
  const name = file.split("/").pop();
  const cached = `${cache}/${name}`;
  if (!existsSync(cached) || sha256(readFileSync(cached)) !== hash) {
    const res = await fetch(`${TOSSFACE_URL}/${file}`);
    if (!res.ok) throw new Error(`토스페이스 ${file}를 받지 못했어요 (${res.status})`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (sha256(buf) !== hash) throw new Error(`토스페이스 ${file}의 해시가 달라요. 원본이 아닐 수 있어 멈춰요`);
    writeFileSync(cached, buf);
  }
  cpSync(cached, `${out}/tossface/${name}`);
}
// 저작권 안내(우리가 쓴 요약·출처 표시)를 라이선스 전문 옆에 함께 넣는다
cpSync("licenses/tossface/NOTICE.md", `${out}/tossface/NOTICE.md`);
console.log("토스페이스 v1.6.1 준비 완료 →", `${out}/tossface`);

// OpenPaper(MIT)에서 가져온 코드의 저작권 표시를 앱에도 넣는다
mkdirSync(`${out}/openpaper`, { recursive: true });
cpSync("licenses/openpaper/LICENSE", `${out}/openpaper/LICENSE`);
cpSync("licenses/openpaper/NOTICE.md", `${out}/openpaper/NOTICE.md`);
