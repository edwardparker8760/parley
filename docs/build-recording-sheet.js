/**
 * Builds docs/recording-sheet.html: a single self-contained file, opened from
 * disk, used to record the demo one shot at a time.
 *
 * Why a generator rather than a hand-written HTML file: the screenshots are
 * embedded as data URIs so the sheet survives being moved or opened with no
 * network, and pasting ~1MB of base64 by hand is not editable afterwards. Run
 * this again after any change to the shot list.
 *
 *   node docs/build-recording-sheet.js
 *
 * Narration is transcribed from docs/demo-video-script.md. Where a token is
 * respelled for text-to-speech, the substitution is declared in `ttsNotes` and
 * rendered visibly on the row, so no wording changes silently.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DOCS = path.dirname(fileURLToPath(import.meta.url));

/** Reads a png next to this script and returns a data URI, or null if absent. */
function dataUri(file) {
  const full = path.join(DOCS, file);
  if (!fs.existsSync(full)) return null;
  return `data:image/png;base64,${fs.readFileSync(full).toString("base64")}`;
}

/**
 * The shots, in recording order.
 *
 * `narration` is the exact spoken text, markdown emphasis removed and tokens
 * respelled only where `ttsNotes` says so. `shotImageNote` is required whenever
 * the screenshot is an approximation rather than this exact frame: a reference
 * image that quietly shows something else is worse than none.
 */
const SHOTS = [
  {
    id: 1,
    time: "0:00 - 0:18",
    name: "The differentiator, first",
    steps: [
      "Open a fresh browser window at parley-blond.vercel.app (the LANDING PAGE, not /app).",
      "Scroll to the very top. The hero fills the frame: headline, the arithmetic-not-instructions line, and the transcript excerpt on the right.",
      "Do not touch anything. Start recording. The address bar must be visible in frame.",
    ],
    narration:
      "Agent payments already exist. Agent pricing does not. Every agent payment demo pays a price somebody else posted. Parley's two agents discover the price themselves: one buying bulk inference capacity, one selling, haggling inside hard limits their owners set in advance.",
    ttsNotes: [],
    image: null,
    imageNote:
      "No capture of the landing hero exists. Frame it so the headline, the marked phrase arithmetic, not instructions, and the transcript excerpt with its CLAMP line are all visible at once.",
    verify:
      "Opens on the hero, not /app. The hero already pictures what these two beats say; /app on load is a static block of explanatory text.",
  },
  {
    id: 2,
    time: "0:18 - 0:32",
    name: "The mechanism",
    steps: [
      "Same hero frame as shot 1.",
      'Rest the cursor near the ">> CLAMP" line in the transcript excerpt as you say "arithmetic disposes".',
      'ON THE WORDS "so I will test it on screen", click "Open the dashboard" in the hero button row.',
      "Do not click early. The click and the last four words land together.",
    ],
    narration:
      "The limits are arithmetic, not instructions in a prompt. The model proposes; arithmetic disposes. No prompt talks an agent past its owner's limit. That is a claim, so I will test it on screen.",
    ttsNotes: [],
    image: null,
    imageNote:
      "Same hero frame as shot 1, until the click. The navigation to /app is the transition into shot 3.",
    verify:
      'The click is what motivates the cut to /app, so the audience is not absorbing a jump. Button label is exactly "Open the dashboard".',
  },
  {
    id: 3,
    time: "0:32 - 1:00",
    name: "Scenario B, the clamp firing",
    steps: [
      "You arrive here from the click at the end of shot 2.",
      'Click "View scenario B" in the row of three at the top.',
      "Wait for the page to render. It is server-rendered, so there is no spinner.",
      'Point the cursor at the buyer column in the "Owner limits" panel.',
      'Hold on the line reading "guardrail overrode the strategy 9 times".',
    ],
    narration:
      "This is a recorded run and the page says so. Blue is the buyer walking up, orange the seller coming down. The dashed lines are the owners' limits: neither agent sees the other's, you see both. They barely overlap, so the buyer walks into its ceiling of nine hundred. Nine times the guardrail overrode what the agent wanted to send. It still closed, inside both limits.",
    ttsNotes: [],
    image: "demo-scenario-b-baseline.png",
    imageNote: null,
    verify:
      "Buyer ceiling 900, seller derived floor 855, buyer clamp count 9, seller 0, settled at 9.00 USDC. Checked against negotiation-snapshot-b.json.",
  },
  {
    id: 4,
    time: "1:00 - 1:40",
    name: "HERO BEAT: break it live",
    hero: true,
    steps: [
      'Scroll down to the section headed "Try to break it".',
      'Click the first preset: "Ceiling below floor: 600 against 700".',
      "It runs immediately and returns finished in one response.",
      "The page moves on its own: the transcript scrolls its last row into view, taking the window with it. Let it settle.",
      "Scroll UP to the chart and the no-overlap line, then DOWN once to the walk-away panel at the bottom of the left column.",
      "Hold on the walk-away panel. It now renders at full height with BOTH cards, BUYER and SELLER, and no longer scrolls inside itself.",
    ],
    narration:
      "Those were recordings. This is not. I am setting the buyer's ceiling to six hundred, new numbers, not the ones you just saw, against a seller floor of seven hundred, derived from its cost and margin. No price satisfies both owners. Computed live on the server, and here it is: nine rounds, then the buyer walks away, and both sides file a post-mortem naming the limit that stopped them. Nothing agreed. Nothing paid. That is the system refusing to break, not me promising it will not.",
    ttsNotes: [],
    image: "demo-scenario-c.png",
    imageNote:
      "APPROXIMATE. This is recorded scenario C (ceiling 600 against a floor of 951), not the preset run (600 against 700). The shape is the same, the floor number is not. Use it for layout only, never as proof of this shot.",
    verify:
      "This is the only live computation in the take. /api/run-custom opens its own in-memory database per request and is not gated on canRunLive, so it runs on the deployed replay instance. Protect this beat in the edit.",
  },
  {
    id: 5,
    time: "1:40 - 2:03",
    name: "The same claim in code (CUT THIS BY DEFAULT)",
    optional: true,
    steps: [
      "DO NOT ALT-TAB DURING THE TAKE. Xbox Game Bar captures a single window; switching breaks the capture.",
      "If keeping it: record this as a SEPARATE clip, before or after the browser take, and splice it in with CapCut.",
      "In that separate clip: second terminal, scrollback cleared, sitting in the repo root.",
      "Run: pnpm --filter @parley/orchestrator test",
      "Let the pass list scroll. Hold on the final count.",
    ],
    narration:
      "And in code: a model that answers every prompt with an absurd price, ninety-nine million, across all three scenarios, puts zero out of band offers on the wire. Property tests, an adversarial corpus, and prompt injection through the counterparty's own text. One hundred forty-eight tests, all green.",
    ttsNotes: [
      'Script says "out-of-band"; hyphens removed so the engine does not read them as pauses.',
    ],
    image: null,
    imageNote:
      "No capture. Terminal output only. Clear scrollback before recording: this is the shot where old commands are visible.",
    verify:
      "Cutting this is now the default, not the fallback. It buys 21 seconds, three of which pay for the benchmark hold in shot 7, and it removes the only alt-tab in the take. The hero beat already proved the same property live. Note also: this command runs 26 tests, while the line says one hundred forty-eight, which is the whole suite. Do not cut to this terminal as if it printed that number.",
  },
  {
    id: 6,
    time: "2:03 - 2:35",
    name: "Settlement and the Circle stack",
    steps: [
      "Alt-tab back to the browser.",
      'Click "View scenario A".',
      "Scroll to the Settlement panel.",
      'Point at the amber badge reading "SIMULATED: no real money moved".',
    ],
    narration:
      "One real payment has run on Arc testnet. Nine point two three U S D C, through Circle Gateway, over the x four oh two flow its facilitator settles. Permission was granted in under one second. The money reached the chain about thirteen minutes later, because Circle settles in batches. Every recording you saw today is labelled simulated on screen. The run you watched me start was live, and you can type your own numbers into that same form and get the same thing.",
    ttsNotes: [
      'USDC respelled "U S D C" so the engine does not read it as one word.',
      'x402 respelled "x four oh two". Read as digits it becomes "x four hundred two", which is not the product name.',
    ],
    image: "demo-scenario-a.png",
    imageNote:
      "Layout reference. Confirm the amber SIMULATED badge is in frame before you speak this line.",
    verify:
      "Do not compress the two latencies. Authorisation was 857 milliseconds; landing on chain took 12 minutes 43 seconds, which \"about thirteen minutes\" rounds fairly. This shot names all five Circle terms: Arc, USDC, Gateway, x402, facilitator.",
  },
  {
    id: "6b",
    time: "3 seconds, silent",
    name: "Benchmark hold (only if shot 5 was cut)",
    optional: true,
    steps: [
      "Navigate back to the landing page.",
      "Scroll to the benchmark table.",
      "HOLD THREE SECONDS IN SILENCE. Say nothing at all.",
      "Then scroll to the top of the hero for the close.",
    ],
    narration: "",
    ttsNotes: [],
    image: null,
    imageNote:
      "No capture. Frame the scenario B row pair so both lines are readable: baseline needed the limit 9 times, engine 0.",
    verify:
      "This is the one claim nothing else in the video makes: on identical limits the blunt agent had to be stopped nine times and the engine never did. It is legible on its own, so narrating it would cost fifteen words the budget does not have. Only take this beat if shot 5 was cut; with shot 5 kept, the take lands at 3:01.",
  },
  {
    id: 7,
    time: "2:35 - 2:55",
    name: "Close, holding the URL",
    steps: [
      "You should be on the LANDING PAGE hero, the frame the video opened on.",
      "Address bar must read the bare parley-blond.vercel.app, no sub-path.",
      "STOP MOVING THE MOUSE. Hands off entirely.",
      "Hold completely static for the full twenty seconds.",
      "Keep holding for three seconds of silence after the last word, then stop recording.",
    ],
    narration:
      "Agents that discover the price, inside limits a human set, with the limits holding whatever the model says. It is live at parley dash blond dot vercel dot app. Set your own limits and try to break it.",
    ttsNotes: [],
    image: null,
    imageNote:
      "No capture. The frame is the landing hero with the address bar legible. A judge must be able to type the URL without rewinding.",
    verify:
      "Ending where the video opened closes the loop, and puts the root URL in the address bar rather than a sub-path.",
  },
];

const PRE_COMMANDS = [
  {
    cmd: "https://parley-blond.vercel.app/app",
    note: "Record against THIS, not localhost. A localhost recording is a claim nobody can check.",
  },
  {
    cmd: "pnpm --filter @parley/orchestrator test",
    note: "Second terminal, cleared, repo root. Only needed for shot 5.",
  },
];

const POST_CHECKS = [
  "Watch the whole video back at full speed, looking for a visible API key. One frame is enough to lose the key. This is unrecoverable once published.",
  "Watch again for any stub presented as real. Every simulated figure must carry its badge on screen.",
  "Confirm all five Circle terms are audible: Arc, USDC, Gateway, x402, facilitator.",
  "Confirm the two latencies were never merged into one number.",
  "Check the runtime is under 3:00.",
  "Confirm the closing URL is legible and held long enough to type.",
  "Upload to YouTube as UNLISTED. Confirm the link plays in a private window, signed out.",
  "Open EVERY submitted link in a private window, signed out: the video, the repo, the deck, and parley-blond.vercel.app.",
  "Confirm the deck opens without a login.",
  "git status is clean and everything is pushed to origin/main before you submit.",
  "Submit on the Encode platform.",
];

/*
 * ------------------------------------------------------------------ Vietnamese
 *
 * Keyed by shot id. `gloss` is an EXPLANATION of the narration, never a
 * translation to be spoken: it says what the shot is FOR, so the presenter
 * understands the point rather than just the clicks.
 *
 * ## The safety rule this file enforces
 *
 * The narration boxes stay English in BOTH languages, because that text is
 * pasted into a text-to-speech engine and the video is in English. A Vietnamese
 * string reaching the copy button would be spoken aloud in the submission. The
 * gloss is therefore rendered OUTSIDE the copy box, below it, and marked as
 * explanation. There is deliberately no Vietnamese `narration` field anywhere in
 * this object: the shape makes the mistake impossible rather than forbidding it
 * in a comment.
 */
const VI = {
  1: {
    name: "Điểm khác biệt, nói ngay câu đầu",
    steps: [
      "Mở cửa sổ trình duyệt mới ở parley-blond.vercel.app (TRANG CHỦ, không phải /app).",
      "Cuộn lên trên cùng. Trong khung hình phải thấy: tiêu đề lớn, dòng chữ được tô sáng \"arithmetic, not instructions\", và bảng hội thoại mẫu bên phải.",
      "Không chạm vào gì cả. Bắt đầu ghi hình. Thanh địa chỉ phải nằm trong khung hình.",
    ],
    verify:
      "Mở ở trang chủ chứ không phải /app. Trang chủ đã sẵn có hình ảnh minh hoạ đúng những gì hai đoạn đầu nói. Còn /app lúc mới mở chỉ là một khối chữ giải thích, không có gì để người xem nhìn.",
    imageNote:
      "Chưa có ảnh chụp trang chủ. Canh khung sao cho tiêu đề, dòng chữ được tô sáng, và bảng hội thoại có dòng CLAMP cùng nằm trong một khung.",
    gloss:
      "Ý của đoạn này: giám khảo xem hàng chục video liên tiếp. Câu đầu tiên phải nói ngay điều khác biệt. Các demo khác cho agent TRẢ một cái giá người ta đã niêm yết sẵn. Parley cho hai agent TỰ MẶC CẢ ra giá.",
  },
  2: {
    name: "Cơ chế: vì sao không ai lừa được agent",
    steps: [
      "Vẫn giữ nguyên khung hình trang chủ như cảnh 1.",
      'Rê chuột tới dòng ">> CLAMP" trong bảng hội thoại đúng lúc đọc tới chữ "arithmetic disposes".',
      'ĐÚNG LÚC đọc "so I will test it on screen", bấm nút "Open the dashboard".',
      "Đừng bấm sớm. Cú bấm và bốn chữ cuối phải rơi cùng một lúc.",
    ],
    verify:
      'Chính cú bấm là lý do chuyển cảnh sang /app, để người xem không thấy hụt hẫng. Nhãn nút đúng là "Open the dashboard".',
    imageNote:
      "Vẫn khung hình trang chủ như cảnh 1, cho tới lúc bấm. Việc chuyển sang /app chính là cầu nối vào cảnh 3.",
    gloss:
      "Ý của đoạn này: giới hạn mà người chủ đặt ra là một phép tính, không phải một câu dặn dò trong prompt. Model chỉ đề xuất, phép tính mới là thứ quyết định. Vì thế không lời lẽ nào dụ được agent vượt giới hạn. Nói xong câu đó là chuyển ngay sang phần chứng minh.",
  },
  3: {
    name: "Kịch bản B: nhìn thấy giới hạn chặn thật",
    steps: [
      "Bạn vừa từ cú bấm ở cuối cảnh 2 sang đây.",
      'Bấm "View scenario B" trong hàng ba nút trên cùng.',
      "Chờ trang hiện ra. Trang được dựng sẵn từ máy chủ nên không có vòng xoay chờ.",
      'Rê chuột tới cột người mua trong bảng "Owner limits".',
      'Dừng lại ở dòng "guardrail overrode the strategy 9 times".',
    ],
    verify:
      "Trần người mua 900, sàn người bán 855, người mua bị chặn 9 lần, người bán 0 lần, chốt ở 9.00 USDC. Đã đối chiếu với file negotiation-snapshot-b.json.",
    imageNote: null,
    gloss:
      "Ý của đoạn này: cho người xem thấy giới hạn không phải lời hứa suông. Agent 9 lần muốn ra giá cao hơn trần của chủ nó, và cả 9 lần đều bị phép tính chặn lại. Cuối cùng vẫn chốt được, và chốt trong giới hạn của cả hai bên.",
  },
  4: {
    name: "CẢNH QUAN TRỌNG NHẤT: thử phá ngay tại chỗ",
    steps: [
      'Cuộn xuống mục "Try to break it".',
      'Bấm nút đầu tiên: "Ceiling below floor: 600 against 700".',
      "Chạy ngay lập tức và trả kết quả trong một lần.",
      "Trang tự cuộn: bảng hội thoại kéo dòng cuối vào tầm nhìn và kéo cả trang theo. Cứ để nó dừng hẳn.",
      'Cuộn LÊN xem biểu đồ và dòng "No overlap exists", rồi cuộn XUỐNG một nhịp tới bảng walk-away ở cuối cột bên trái.',
      "Dừng ở bảng walk-away. Bảng này giờ hiện đủ chiều cao với CẢ HAI thẻ, BUYER và SELLER.",
    ],
    verify:
      "Đây là phần duy nhất trong cả video được máy chủ tính THẬT ngay lúc bấm, không phải bản ghi sẵn. Khi dựng phim phải giữ nguyên đoạn này, không cắt.",
    imageNote:
      "ẢNH GẦN ĐÚNG THÔI. Đây là kịch bản C đã ghi sẵn (trần 600 với sàn 951), không phải lần chạy 600 với 700. Hình dạng giống nhau nhưng con số sàn thì khác. Chỉ dùng để canh bố cục, tuyệt đối không dùng làm bằng chứng cho cảnh này.",
    gloss:
      "Ý của đoạn này: đây là bằng chứng mạnh nhất trong cả video. Người xem thấy chính bạn đặt trần người mua là 600 trong khi sàn người bán là 700. Không có mức giá nào làm hài lòng cả hai. Hệ thống không cố nặn ra một cái deal cho đẹp: hai agent nhận ra điều đó, bỏ đi, và mỗi bên ghi lại đúng giới hạn nào đã chặn mình. Nói cách khác, người xem thấy hệ thống TỪ CHỐI vỡ, chứ không phải nghe bạn hứa là nó sẽ không vỡ.",
  },
  5: {
    name: "Cùng điều đó, chứng minh bằng test (MẶC ĐỊNH LÀ CẮT)",
    steps: [
      "ĐỪNG ALT-TAB TRONG LÚC ĐANG GHI. Xbox Game Bar chỉ ghi một cửa sổ; đổi cửa sổ là hỏng bản ghi.",
      "Nếu vẫn muốn giữ: quay RIÊNG một clip khác, rồi ghép vào bằng CapCut.",
      "Trong clip riêng đó: cửa sổ terminal thứ hai, đã xoá sạch màn hình, đang đứng ở thư mục gốc của repo.",
      "Chạy: pnpm --filter @parley/orchestrator test",
      "Để danh sách test chạy qua. Dừng ở con số tổng kết cuối cùng.",
    ],
    verify:
      "Cắt đoạn này giờ là mặc định chứ không còn là phương án dự phòng. Với lời thoại mới ở cảnh 6, giữ đoạn này thì video dài 3:08, tức là đã quá 3 phút trước cả khi tính thời gian dừng tay bấm chuột. Cắt đi thì còn 2:48. Cảnh 4 vốn đã chứng minh đúng điều này, mà lại chứng minh trực tiếp trên màn hình.",
    imageNote:
      "Không có ảnh. Chỉ là màn hình terminal. Nhớ xoá sạch lịch sử lệnh trước khi quay: đây chính là cảnh dễ để lộ lệnh cũ nhất.",
    gloss:
      "Ý của đoạn này: giả sử model bị chiếm quyền hoàn toàn và mỗi lượt đều đòi một cái giá vô lý, thì vẫn không có lệnh nào vượt giới hạn lọt ra ngoài được. Đây là chứng minh bằng test, thay vì bằng lời nói.",
  },
  "6b": {
    name: "Dừng 3 giây ở bảng so sánh (chỉ khi đã cắt cảnh 5)",
    steps: [
      "Quay lại trang chủ.",
      "Cuộn tới bảng benchmark.",
      "DỪNG YÊN 3 GIÂY. Không nói một chữ nào.",
      "Sau đó cuộn lên đầu trang để đọc lời kết.",
    ],
    verify:
      "Đây là điều duy nhất mà cả video không nói ở chỗ nào khác: với cùng một bộ giới hạn, agent thô sơ phải bị chặn 9 lần, còn agent thật sự thì không cần bị chặn lần nào. Bảng tự nó đã rõ, nên thêm lời thoại chỉ tốn thời gian mà không rõ hơn.",
    imageNote:
      "Không có ảnh. Canh khung sao cho đọc được cả hai dòng của kịch bản B: baseline cần giới hạn chặn 9 lần, engine 0 lần.",
    gloss:
      "Đoạn này im lặng hoàn toàn, không có lời thoại để dán vào phần đọc. Chỉ dừng hình 3 giây cho người xem tự đọc bảng.",
  },
  6: {
    name: "Thanh toán và bộ công cụ Circle",
    steps: [
      "Alt-tab về trình duyệt.",
      'Bấm "View scenario A".',
      "Cuộn tới bảng Settlement.",
      'Rê chuột tới huy hiệu màu hổ phách ghi "SIMULATED: no real money moved".',
    ],
    verify:
      "Đừng gộp hai mốc thời gian làm một. Được chấp thuận mất 857 mili giây; lên chuỗi khối thì mất thêm 12 phút 43 giây. Cảnh này cũng là chỗ duy nhất đọc đủ năm tên công cụ của Circle: Arc, USDC, Gateway, x402, facilitator.",
    imageNote:
      "Chỉ dùng để canh bố cục. Trước khi đọc lời thoại, kiểm tra huy hiệu SIMULATED màu hổ phách đã nằm trong khung hình chưa.",
    gloss:
      "Ý của đoạn này: thừa nhận thẳng thắn cái gì là tiền thật và cái gì là mô phỏng. Đã có đúng một lần trả tiền thật 9.23 USDC qua Circle Gateway, và số dư Gateway của người mua tụt đúng bằng chừng đó. Nhưng tiền chạy bên trong hệ thống số dư của Gateway, không phải một giao dịch chuyển tiền trên chuỗi khối. Nên nếu giám khảo bấm vào link explorer, họ chỉ thấy khoản nạp 12.00 USDC vào Gateway và một lô gộp của Circle, chứ không thấy dòng nào ghi tên thương vụ này. Nói trước điều đó ngay trong video thì đáng tin hơn nhiều so với để họ tự phát hiện.",
  },
  7: {
    name: "Kết: giữ yên màn hình có địa chỉ web",
    steps: [
      "Bạn đang ở TRANG CHỦ, đúng khung hình đã mở đầu video.",
      "Thanh địa chỉ phải là parley-blond.vercel.app, không có đuôi nào phía sau.",
      "BỎ TAY KHỎI CHUỘT. Không di chuyển gì cả.",
      "Giữ yên đủ 20 giây.",
      "Đọc xong còn giữ thêm 3 giây im lặng rồi mới tắt ghi hình.",
    ],
    verify:
      "Kết thúc ở đúng nơi đã bắt đầu, và để địa chỉ gốc trên thanh URL thay vì một đường dẫn con.",
    imageNote:
      "Không có ảnh. Khung hình là trang chủ với thanh địa chỉ đọc được rõ. Giám khảo phải gõ được địa chỉ mà không cần tua lại.",
    gloss:
      "Ý của đoạn này: giám khảo phải đọc và gõ được địa chỉ mà không phải tua lại video. Câu cuối là lời mời họ tự vào đặt số của mình và thử phá.",
  },
};

/** Header, banners and checklist, in both languages. */
const UI = {
  subtitle: {
    en: "One shot at a time. Paste each line into CapCut text-to-speech, record the shot, tick it off.",
    vi: "Làm từng cảnh một. Dán từng dòng lời thoại vào phần đọc của CapCut, quay cảnh đó, rồi tích vào ô.",
  },
  progress: { en: "shots recorded", vi: "cảnh đã quay xong" },
  beforeRecord: { en: "Before you press record", vi: "Trước khi bấm ghi hình" },
  theTake: { en: "The take", vi: "Thông số bản quay" },
  afterRecord: {
    en: "After recording, before submitting",
    vi: "Sau khi quay xong, trước khi nộp bài",
  },
  doThis: { en: "Do this", vi: "Làm thế này" },
  pasteInto: {
    en: "Paste into text-to-speech",
    vi: "Dán vào phần đọc (giữ nguyên tiếng Anh)",
  },
  screenLooks: { en: "Screen should look like", vi: "Màn hình phải trông như thế này" },
  check: { en: "Check", vi: "Lưu ý" },
  respelled: { en: "Respelled for speech", vi: "Viết lại cho máy đọc đúng" },
  words: { en: "words", vi: "từ" },
  silent: { en: "silent", vi: "im lặng" },
  optional: { en: "optional", vi: "tuỳ chọn" },
  noCopy: { en: "No capture for this shot", vi: "Cảnh này chưa có ảnh mẫu" },
  nothingToSay: {
    en: "Nothing to say. This beat is silent.",
    vi: "Không có lời thoại. Đoạn này im lặng.",
  },
  copyBtn: { en: "Copy line", vi: "Chép dòng này" },
  copied: { en: "Copied", vi: "Đã chép" },
  glossLabel: {
    en: "",
    vi: "Giải thích (KHÔNG đọc, KHÔNG dán vào máy đọc)",
  },
  langBtn: { en: "Tiếng Việt", vi: "English" },
  fields: {
    resolution: { en: "Resolution", vi: "Độ phân giải" },
    limit: { en: "Hard limit", vi: "Giới hạn cứng" },
    wordsAll: { en: "Words, all beats", vi: "Số từ, giữ đủ cảnh" },
    wordsCut: { en: "Words, shot 5 cut", vi: "Số từ, đã cắt cảnh 5" },
    runAll: { en: "Runtime, all beats", vi: "Thời lượng, giữ đủ cảnh" },
    runCut: { en: "Runtime, shot 5 cut", vi: "Thời lượng, đã cắt cảnh 5" },
    host: { en: "Video host", vi: "Đăng video ở đâu" },
  },
};

const PRE_VI = [
  "Khung hình mở đầu là TRANG CHỦ, không phải /app. Quay vào địa chỉ NÀY, không phải localhost. Thanh địa chỉ phải nằm trong khung suốt cả bản quay: giám khảo nhìn thấy địa chỉ thì họ tự mở được, còn bản quay localhost là lời nói không ai kiểm chứng được.",
  "Vào một lần cho nóng máy, rồi quay lại trang chủ. Route này dựng động, nên lần vào đầu tiên khi máy chủ còn nguội có thể chậm, và bạn không muốn cái chậm đó rơi đúng lúc chuyển cảnh ở giây thứ 32.",
  "Chỉ dùng cho cảnh 5, mà cảnh 5 thì mặc định là cắt. Nếu vẫn giữ, hãy quay RIÊNG một clip: Xbox Game Bar chỉ ghi một cửa sổ, alt-tab giữa chừng là hỏng bản ghi.",
];

const POST_CHECKS_VI = [
  "Xem lại toàn bộ video ở tốc độ thường, soi xem có lộ API key không. Chỉ một khung hình là mất key. Đã đăng lên rồi thì không cứu được.",
  "Xem lại lần nữa xem có chỗ nào trình bày số liệu mô phỏng như thể là thật không. Mọi con số mô phỏng đều phải có nhãn trên màn hình.",
  "Kiểm tra đủ năm tên công cụ Circle có được đọc thành tiếng không: Arc, USDC, Gateway, x402, facilitator.",
  "Kiểm tra hai mốc thời gian không bị gộp làm một.",
  "Kiểm tra thời lượng dưới 3:00.",
  "Kiểm tra địa chỉ web ở cuối video đọc được và giữ đủ lâu để gõ theo.",
  "Đăng lên YouTube ở chế độ KHÔNG CÔNG KHAI (unlisted). Kiểm tra link chạy được trong cửa sổ ẩn danh, lúc chưa đăng nhập.",
  "Mở TẤT CẢ link sẽ nộp trong cửa sổ ẩn danh, chưa đăng nhập: video, repo, bộ slide, và parley-blond.vercel.app.",
  "Kiểm tra bộ slide mở được mà không cần đăng nhập.",
  "git status phải sạch và mọi thứ đã đẩy lên origin/main trước khi nộp.",
  "Nộp bài trên nền tảng Encode.",
];

/* ------------------------------------------------------------------ render */

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Emits both languages, one of which the stylesheet hides.
 *
 * Rendering both and toggling with CSS keeps the page a single static file with
 * no rebuild and no fetch, and means a missing translation is visible as an
 * empty box rather than silently falling back to English.
 */
const bi = (en, vi) =>
  `<span class="t-en">${esc(en)}</span><span class="t-vi">${esc(vi ?? en)}</span>`;

/** Copy text lives in an attribute, so quotes and newlines must be neutralised. */
const escAttr = (s) => esc(s).replace(/"/g, "&quot;");

function renderShot(shot) {
  const img = shot.image ? dataUri(shot.image) : null;
  if (shot.image && !img) {
    console.warn(`WARNING: ${shot.image} not found, shot ${shot.id} has no image`);
  }

  const vi = VI[shot.id] || {};

  const steps = shot.steps
    .map((s, i) => `<li>${bi(s, vi.steps && vi.steps[i])}</li>`)
    .join("\n          ");

  const ttsNotes = shot.ttsNotes.length
    ? `<p class="tts-note"><strong>${bi(
        UI.respelled.en,
        UI.respelled.vi,
      )}:</strong> ${shot.ttsNotes.map(esc).join(" ")}</p>`
    : "";

  const verify = shot.verify
    ? `<p class="verify"><strong>${bi(UI.check.en, UI.check.vi)}:</strong> ${bi(
        shot.verify,
        vi.verify,
      )}</p>`
    : "";

  const imageBlock = img
    ? `<img src="${img}" alt="Reference frame for shot ${shot.id}">`
    : `<div class="no-image">${bi(UI.noCopy.en, UI.noCopy.vi)}</div>`;

  const imageNote = shot.imageNote
    ? `<p class="${
        /APPROXIMATE|Closest/.test(shot.imageNote) ? "img-warn" : "img-note"
      }">${bi(shot.imageNote, vi.imageNote)}</p>`
    : "";

  const wordCount = shot.narration.trim()
    ? shot.narration.trim().split(/\s+/).length
    : 0;

  /*
   * The gloss sits OUTSIDE the say-box, never inside it. The copy button reads
   * `data-copy` off the English narration only, so no Vietnamese text can reach
   * the clipboard and be spoken in the submission.
   */
  const gloss = vi.gloss
    ? `<div class="gloss"><span class="gloss-label">${esc(
        UI.glossLabel.vi,
      )}</span><p>${esc(vi.gloss)}</p></div>`
    : "";

  /* A silent beat gets no copy box: a copy button that yields an empty string
     is a trap at 2am. It says "no line" and explains why instead. */
  const sayBlock = wordCount
    ? `<div class="say-box">
              <p class="narration" lang="en">${esc(shot.narration)}</p>
              <button class="copy" data-copy="${escAttr(shot.narration)}"
                      data-en="${escAttr(UI.copyBtn.en)}" data-vi="${escAttr(
                        UI.copyBtn.vi,
                      )}" data-done-en="${escAttr(
                        UI.copied.en,
                      )}" data-done-vi="${escAttr(UI.copied.vi)}">${
                        UI.copyBtn.en
                      }</button>
            </div>
            ${ttsNotes}
            ${gloss}`
    : `<div class="say-box silent">
              <p class="narration">${bi(
                UI.nothingToSay.en,
                UI.nothingToSay.vi,
              )}</p>
            </div>
            ${gloss}`;

  const classes = [
    "shot",
    shot.hero ? "hero" : "",
    shot.optional ? "optional" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return `
      <section class="${classes}" id="shot-${shot.id}">
        <header class="shot-head">
          <label class="tick">
            <input type="checkbox" data-shot="${shot.id}">
            <span class="tickbox" aria-hidden="true"></span>
          </label>
          <div class="shot-title">
            <span class="time">${esc(shot.time)}</span>
            <h2>${bi(shot.name, vi.name)}</h2>
            ${
              shot.optional
                ? `<span class="badge-opt">${bi(
                    UI.optional.en,
                    UI.optional.vi,
                  )}</span>`
                : ""
            }
          </div>
          <span class="wc">${
            wordCount
              ? wordCount + " " + UI.words.en
              : bi(UI.silent.en, UI.silent.vi)
          }</span>
        </header>

        <div class="shot-body">
          <div class="col-do">
            <h3>${bi(UI.doThis.en, UI.doThis.vi)}</h3>
            <ol>
          ${steps}
            </ol>
            ${verify}
          </div>

          <div class="col-say">
            <h3>${bi(UI.pasteInto.en, UI.pasteInto.vi)}</h3>
            ${sayBlock}
          </div>

          <div class="col-see">
            <h3>${bi(UI.screenLooks.en, UI.screenLooks.vi)}</h3>
            ${imageBlock}
            ${imageNote}
          </div>
        </div>
      </section>`;
}

const countWords = (s) => (s.trim() ? s.trim().split(/\s+/).length : 0);

const totalWords = SHOTS.reduce((n, s) => n + countWords(s.narration), 0);


/*
 * Runtime is computed from the SCRIPT's word count, not this sheet's.
 *
 * Respelling for speech splits one token into several ("USDC" becomes "U S D C",
 * "x402" becomes "x four oh two"), which inflates the count here by nine words
 * without adding any time to the spoken track: the engine says the same sounds
 * either way. Deriving the estimate from the inflated count reports 3:02 for a
 * take that runs 2:58, which is the wrong side of the limit to be wrong on.
 *
 * These are the canonical counts from docs/demo-video-script.md. Update them
 * together with the narration.
 */
const SCRIPT_WORDS_ALL = 387;
const SCRIPT_WORDS_CUT = 342;

const runtime = (words, wpm) => {
  const s = Math.round((words / wpm) * 60);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Parley recording sheet</title>
<style>
  :root {
    --bg: #14161a;
    --panel: #1c1f25;
    --panel-2: #23272f;
    --line: #333944;
    --ink: #e8eaed;
    --dim: #9aa3af;
    --accent: #f0b429;
    --good: #4ade80;
    --warn: #fb7185;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 2rem 1.5rem 5rem;
    background: var(--bg);
    color: var(--ink);
    font: 16px/1.6 -apple-system, "Segoe UI", Roboto, system-ui, sans-serif;
  }
  .wrap { max-width: 1280px; margin: 0 auto; position: relative; }
  h1 { font-size: 1.8rem; margin: 0 0 .3rem; }
  .sub { color: var(--dim); margin: 0 0 .8rem; }

  /* ---------- language toggle ----------
     Both languages are in the DOM; one is hidden. No fetch, no rebuild, and a
     missing translation shows as a gap rather than silently reading English. */
  .t-vi { display: none; }
  body.lang-vi .t-en { display: none; }
  body.lang-vi .t-vi { display: inline; }

  #lang-toggle {
    position: absolute;
    top: 0; right: 0;
    background: var(--panel-2);
    color: var(--ink);
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: .5rem .9rem;
    font-size: .9rem;
    font-weight: 600;
    cursor: pointer;
    z-index: 10;
  }
  #lang-toggle:hover { border-color: var(--accent); color: var(--accent); }

  .lang-warning {
    border: 1px solid var(--warn);
    border-radius: 6px;
    padding: .6rem .9rem;
    margin: 0 0 1.4rem;
    color: var(--warn);
    font-size: .87rem;
    line-height: 1.5;
  }

  /* The Vietnamese gloss. Deliberately OUTSIDE the copy box and visually unlike
     it, so it never reads as something to paste. */
  .gloss { display: none; }
  body.lang-vi .gloss {
    display: block;
    margin-top: .7rem;
    border-left: 3px solid var(--dim);
    background: rgba(255,255,255,.03);
    border-radius: 0 5px 5px 0;
    padding: .6rem .8rem;
  }
  .gloss-label {
    display: block;
    font-size: .7rem;
    text-transform: uppercase;
    letter-spacing: .06em;
    color: var(--warn);
    margin-bottom: .35rem;
  }
  .gloss p { margin: 0; font-size: .92rem; line-height: 1.6; color: var(--ink); }

  .banner {
    background: var(--panel);
    border: 1px solid var(--line);
    border-left: 4px solid var(--accent);
    border-radius: 6px;
    padding: 1.1rem 1.3rem;
    margin-bottom: 1.2rem;
  }
  .banner h2 { margin: 0 0 .7rem; font-size: 1.05rem; letter-spacing: .04em; text-transform: uppercase; color: var(--accent); }
  .banner.stop { border-left-color: var(--warn); }
  .banner.stop h2 { color: var(--warn); }

  .facts { display: flex; flex-wrap: wrap; gap: 1.6rem; margin: 0 0 1rem; padding: 0; list-style: none; }
  .facts div { min-width: 130px; }
  .facts dt { color: var(--dim); font-size: .78rem; text-transform: uppercase; letter-spacing: .06em; }
  .facts dd { margin: .15rem 0 0; font-size: 1.15rem; font-weight: 600; }

  code, .cmd {
    font-family: "Cascadia Mono", Consolas, "SF Mono", Menlo, monospace;
    font-size: .9rem;
  }
  .cmd-row { margin: .6rem 0; }
  .cmd {
    display: inline-block;
    background: #0f1115;
    border: 1px solid var(--line);
    border-radius: 4px;
    padding: .35rem .6rem;
    color: var(--accent);
    word-break: break-all;
  }
  .cmd-note { color: var(--dim); font-size: .88rem; margin: .25rem 0 0; }

  .shot {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 8px;
    margin: 0 0 1.1rem;
    overflow: hidden;
  }
  .shot.hero { border-color: var(--accent); }
  .shot.optional { border-style: dashed; }
  .shot.done { opacity: .45; }
  .badge-opt {
    font-size: .68rem; text-transform: uppercase; letter-spacing: .08em;
    border: 1px solid var(--dim); color: var(--dim);
    border-radius: 3px; padding: .1rem .4rem;
  }
  .say-box.silent { border-style: dashed; }
  .say-box.silent .narration { color: var(--dim); font-style: italic; margin: 0; }

  .shot-head {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: .85rem 1.1rem;
    background: var(--panel-2);
    border-bottom: 1px solid var(--line);
  }
  .shot.hero .shot-head { background: #2a2415; }
  .shot-title { display: flex; align-items: baseline; gap: .9rem; flex: 1; flex-wrap: wrap; }
  .shot-title h2 { margin: 0; font-size: 1.05rem; }
  .time { font-family: Consolas, monospace; color: var(--accent); font-size: .95rem; }
  .wc { color: var(--dim); font-size: .8rem; white-space: nowrap; }

  .tick { cursor: pointer; display: flex; }
  .tick input { position: absolute; opacity: 0; width: 0; height: 0; }
  .tickbox {
    width: 22px; height: 22px;
    border: 2px solid var(--dim);
    border-radius: 4px;
    display: inline-block;
    position: relative;
  }
  .tick input:checked + .tickbox { background: var(--good); border-color: var(--good); }
  .tick input:checked + .tickbox::after {
    content: "";
    position: absolute; left: 6px; top: 1px;
    width: 6px; height: 12px;
    border: solid #14161a; border-width: 0 3px 3px 0;
    transform: rotate(45deg);
  }
  .tick input:focus-visible + .tickbox { outline: 2px solid var(--accent); outline-offset: 2px; }

  .shot-body {
    display: grid;
    grid-template-columns: 1fr 1.15fr .9fr;
    gap: 1.3rem;
    padding: 1.1rem;
  }
  @media (max-width: 1000px) { .shot-body { grid-template-columns: 1fr; } }

  .shot-body h3 {
    margin: 0 0 .6rem;
    font-size: .76rem;
    text-transform: uppercase;
    letter-spacing: .07em;
    color: var(--dim);
  }
  .col-do ol { margin: 0; padding-left: 1.2rem; }
  .col-do li { margin-bottom: .4rem; }

  .say-box {
    background: #0f1115;
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: .9rem;
  }
  .narration { margin: 0 0 .8rem; font-size: 1.02rem; line-height: 1.65; }
  .copy {
    width: 100%;
    background: var(--accent);
    color: #14161a;
    border: 0;
    border-radius: 5px;
    padding: .55rem;
    font-size: .92rem;
    font-weight: 700;
    cursor: pointer;
  }
  .copy:hover { filter: brightness(1.08); }
  .copy.copied { background: var(--good); }

  .tts-note, .img-note, .verify, .img-warn {
    font-size: .84rem;
    margin: .6rem 0 0;
    line-height: 1.5;
  }
  .tts-note { color: var(--accent); }
  .img-note, .verify { color: var(--dim); }
  .img-warn { color: var(--warn); }
  .verify { border-left: 2px solid var(--line); padding-left: .7rem; }

  .col-see img {
    width: 100%;
    height: auto;
    border: 1px solid var(--line);
    border-radius: 5px;
    display: block;
  }
  .no-image {
    border: 1px dashed var(--line);
    border-radius: 5px;
    padding: 2.2rem 1rem;
    text-align: center;
    color: var(--dim);
    font-size: .88rem;
  }

  ol.post { padding-left: 1.3rem; }
  ol.post li { margin-bottom: .55rem; }

  .progress {
    position: sticky; top: 0; z-index: 5;
    background: var(--bg);
    padding: .7rem 0;
    margin-bottom: 1rem;
    border-bottom: 1px solid var(--line);
    color: var(--dim);
    font-size: .9rem;
  }
  .progress strong { color: var(--good); font-size: 1.05rem; }

  footer { margin-top: 2.5rem; color: var(--dim); font-size: .84rem; }
</style>
</head>
<body>
<div class="wrap">

  <button id="lang-toggle" type="button"
          data-en="${escAttr(UI.langBtn.en)}" data-vi="${escAttr(UI.langBtn.vi)}">${
            UI.langBtn.en
          }</button>

  <h1>Parley recording sheet</h1>
  <p class="sub">${bi(UI.subtitle.en, UI.subtitle.vi)}</p>

  <p class="lang-warning">${bi(
    "The narration boxes stay in English in both languages, because that text is pasted into text-to-speech and the video is in English. Vietnamese appears only as an explanation below each box. Never paste the explanation.",
    "Ô lời thoại luôn giữ tiếng Anh ở cả hai chế độ, vì đó là chữ sẽ dán vào máy đọc và video là tiếng Anh. Tiếng Việt chỉ xuất hiện ở phần giải thích bên dưới mỗi ô. Tuyệt đối không dán phần giải thích vào máy đọc.",
  )}</p>

  <div class="progress"><strong id="done-count">0</strong> <span class="t-en">of ${
    SHOTS.length
  } ${UI.progress.en}</span><span class="t-vi">/ ${SHOTS.length} ${
    UI.progress.vi
  }</span></div>

  <div class="banner stop">
    <h2>${bi(UI.beforeRecord.en, UI.beforeRecord.vi)}</h2>
    <div class="cmd-row">
      <span class="cmd">https://parley-blond.vercel.app</span>
      <p class="cmd-note">${bi(
        "The opening frame is the LANDING PAGE hero, not /app. Record against this, NOT localhost. The address bar must be in frame for the whole take: a judge who can see the URL can open it, and a localhost recording is a claim nobody can check.",
        PRE_VI[0],
      )}</p>
    </div>
    <div class="cmd-row">
      <span class="cmd">https://parley-blond.vercel.app/app</span>
      <p class="cmd-note">${bi(
        "Visit once to warm it, then go back to the landing page. The route is force-dynamic, so a cold first visit can be slow, and you do not want that on the cut at 0:32.",
        PRE_VI[1],
      )}</p>
    </div>
    <div class="cmd-row">
      <span class="cmd">pnpm --filter @parley/orchestrator test</span>
      <p class="cmd-note">${bi(
        "Only for shot 5, which is cut by default. If you keep it, capture it as a SEPARATE clip: Xbox Game Bar captures one window, so alt-tabbing mid-take breaks the recording.",
        PRE_VI[2],
      )}</p>
    </div>
    <p class="cmd-note" style="margin-top:.9rem">${bi(
      "Close every editor window in case a dotenv file is in a tab. Close every terminal whose scrollback touched a dotenv file, provision-wallets, or a faucet page. Close every browser tab except this one recording target. Turn off notification popups.",
      "Đóng hết cửa sổ soạn thảo, phòng khi có file dotenv đang mở trong một tab. Đóng hết terminal nào từng chạy dotenv, provision-wallets, hay mở trang faucet. Đóng hết tab trình duyệt trừ đúng tab đang quay. Tắt thông báo bật lên.",
    )}</p>
    <p class="cmd-note">${bi(
      "Rehearse shot 4 before recording anything. The result renders ABOVE the panel, and the page moves on its own when it arrives: the transcript scrolls its last row into view and takes the window with it. Let it settle, then scroll up to the chart and down once to the walk-away panel. That fumble on camera is the most likely retake.",
      "Tập trước cảnh 4 rồi hãy quay bất cứ thứ gì. Kết quả hiện ra Ở TRÊN bảng nhập, và trang tự cuộn khi kết quả về: bảng hội thoại kéo dòng cuối vào tầm nhìn và kéo cả trang theo. Cứ để nó dừng hẳn, rồi cuộn lên xem biểu đồ, cuộn xuống một nhịp tới bảng walk-away. Lóng ngóng chỗ này là lý do phải quay lại nhiều nhất.",
    )}</p>
  </div>

  <div class="banner">
    <h2>${bi(UI.theTake.en, UI.theTake.vi)}</h2>
    <dl class="facts">
      <div><dt>${bi(
        UI.fields.resolution.en,
        UI.fields.resolution.vi,
      )}</dt><dd>1920 x 1080</dd></div>
      <div><dt>${bi(UI.fields.limit.en, UI.fields.limit.vi)}</dt><dd>${bi(
        "Under 3:00",
        "Dưới 3:00",
      )}</dd></div>
      <div><dt>${bi(
        UI.fields.wordsAll.en,
        UI.fields.wordsAll.vi,
      )}</dt><dd>${SCRIPT_WORDS_ALL}</dd></div>
      <div><dt>${bi(
        UI.fields.wordsCut.en,
        UI.fields.wordsCut.vi,
      )}</dt><dd>${SCRIPT_WORDS_CUT}</dd></div>
      <div><dt>${bi(UI.fields.runAll.en, UI.fields.runAll.vi)}</dt><dd>${runtime(
        SCRIPT_WORDS_ALL,
        130,
      )}</dd></div>
      <div><dt>${bi(UI.fields.runCut.en, UI.fields.runCut.vi)}</dt><dd>${runtime(
        SCRIPT_WORDS_CUT,
        130,
      )}</dd></div>
      <div><dt>${bi(UI.fields.host.en, UI.fields.host.vi)}</dt><dd>${bi(
        "YouTube, unlisted",
        "YouTube, không công khai",
      )}</dd></div>
    </dl>
    <p class="cmd-note">${bi(
      `Runtimes are the spoken track at 130 words per minute, a slow deliberate pace. With every beat kept the take lands at ${runtime(
        SCRIPT_WORDS_ALL,
        130,
      )}, which is already over the 3:00 limit before a single pause for a click. Cutting shot 5 is no longer a choice: it brings the take to ${runtime(
        SCRIPT_WORDS_CUT,
        130,
      )}, removes the only alt-tab, and three of the recovered seconds pay for the benchmark hold.`,
      `Thời lượng tính theo tốc độ đọc 130 từ mỗi phút, tức là đọc chậm và rõ. Giữ đủ mọi cảnh thì video dài ${runtime(
        SCRIPT_WORDS_ALL,
        130,
      )}, đã quá mốc 3:00 trước cả khi tính thời gian dừng tay bấm chuột. Cắt cảnh 5 giờ không còn là lựa chọn nữa: cắt đi thì còn ${runtime(
        SCRIPT_WORDS_CUT,
        130,
      )}, bỏ được lần alt-tab duy nhất, và ba giây tiết kiệm được dùng cho đoạn dừng ở bảng so sánh.`,
    )}</p>
    <p class="cmd-note">${bi(
      `Per-shot word counts on the rows below total ${totalWords}, higher than the ${SCRIPT_WORDS_ALL} used above, because respelling for speech splits one token into several. It costs no time to say, so the runtime figures use the script's count.`,
      `Cộng số từ của từng cảnh bên dưới ra ${totalWords}, cao hơn con số ${SCRIPT_WORDS_ALL} dùng ở trên, vì viết lại cho máy đọc thì một chữ tách thành nhiều chữ. Đọc lên vẫn mất chừng ấy thời gian, nên phần thời lượng lấy theo con số của kịch bản.`,
    )}</p>
    <p class="cmd-note">${bi(
      "Never cut shot 4, the SIMULATED badge sentence in shot 6, or the static URL hold in shot 7.",
      "Tuyệt đối không cắt cảnh 4, câu nói về huy hiệu SIMULATED ở cảnh 6, và đoạn giữ yên màn hình có địa chỉ web ở cảnh 7.",
    )}</p>
  </div>
${SHOTS.map(renderShot).join("\n")}

  <div class="banner stop" style="margin-top:1.6rem">
    <h2>${bi(UI.afterRecord.en, UI.afterRecord.vi)}</h2>
    <ol class="post">
      ${POST_CHECKS.map((c, i) => `<li>${bi(c, POST_CHECKS_VI[i])}</li>`).join(
        "\n      ",
      )}
    </ol>
  </div>

  <footer>${bi(
    "Generated from docs/demo-video-script.md by docs/build-recording-sheet.js. Narration transcribed from that script; substitutions for speech are marked on the row. Local working file: not deployed, not linked from the app, not part of the submission.",
    "Sinh ra từ docs/demo-video-script.md bằng docs/build-recording-sheet.js. Lời thoại chép từ kịch bản đó; chỗ nào viết lại cho máy đọc đều được ghi chú ngay trên dòng. Đây là file làm việc cá nhân: không triển khai, không có link nào trong ứng dụng trỏ tới, không nằm trong bài nộp.",
  )}</footer>
</div>

<script>
  // Copy uses the async clipboard API where the browser allows it on file://,
  // and falls back to a temporary textarea where it does not. The fallback is
  // the point: this page is opened from disk, where the modern API is not
  // guaranteed, and a copy button that silently fails is worse than none.
  function copyText(text, button) {
    var done = function () {
      var vi = document.body.classList.contains("lang-vi");
      var original = button.getAttribute(vi ? "data-vi" : "data-en");
      button.textContent = button.getAttribute(vi ? "data-done-vi" : "data-done-en");
      button.classList.add("copied");
      setTimeout(function () {
        button.textContent = original;
        button.classList.remove("copied");
      }, 1400);
    };
    var fallback = function () {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.top = "-1000px";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); done(); }
      catch (e) { button.textContent = "Copy failed, select by hand"; }
      document.body.removeChild(ta);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else {
      fallback();
    }
  }

  document.querySelectorAll(".copy").forEach(function (b) {
    b.addEventListener("click", function () {
      // data-copy is always the ENGLISH narration. The language toggle never
      // touches it, so the Vietnamese gloss cannot reach the clipboard and be
      // spoken in the submitted video.
      copyText(b.getAttribute("data-copy"), b);
    });
  });

  // ---------- language toggle ----------
  var LANG_KEY = "parley-recording-sheet-lang";
  var toggle = document.getElementById("lang-toggle");

  function applyLang(lang) {
    var vi = lang === "vi";
    document.body.classList.toggle("lang-vi", vi);
    document.documentElement.lang = vi ? "vi" : "en";
    toggle.textContent = toggle.getAttribute(vi ? "data-vi" : "data-en");
    // Copy buttons are chrome, not narration, so their label follows the UI.
    document.querySelectorAll(".copy").forEach(function (b) {
      if (!b.classList.contains("copied")) {
        b.textContent = b.getAttribute(vi ? "data-vi" : "data-en");
      }
    });
    try { localStorage.setItem(LANG_KEY, lang); } catch (e) {}
  }

  toggle.addEventListener("click", function () {
    applyLang(document.body.classList.contains("lang-vi") ? "en" : "vi");
  });

  var savedLang = "en";
  try { savedLang = localStorage.getItem(LANG_KEY) || "en"; } catch (e) {}
  applyLang(savedLang);

  // Ticks persist in localStorage so closing the page mid-session does not lose
  // which shots are already in the can.
  var KEY = "parley-recording-sheet-v1";
  var state = {};
  try { state = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) { state = {}; }

  function refresh() {
    var n = 0;
    document.querySelectorAll('input[data-shot]').forEach(function (cb) {
      if (cb.checked) n++;
      cb.closest(".shot").classList.toggle("done", cb.checked);
    });
    document.getElementById("done-count").textContent = n;
  }

  document.querySelectorAll('input[data-shot]').forEach(function (cb) {
    var id = cb.getAttribute("data-shot");
    if (state[id]) cb.checked = true;
    cb.addEventListener("change", function () {
      state[id] = cb.checked;
      try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
      refresh();
    });
  });
  refresh();
</script>
</body>
</html>
`;

fs.writeFileSync(path.join(DOCS, "recording-sheet.html"), html, "utf8");
const kb = Math.round(Buffer.byteLength(html) / 1024);
console.log(`wrote docs/recording-sheet.html (${kb} KB, ${SHOTS.length} shots, ${totalWords} spoken words)`);
