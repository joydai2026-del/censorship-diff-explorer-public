// Builds the SAMPLE snapshot files in data/sample/snapshots/.
//
// SAMPLE DATA FOR DEMO, NOT REAL POSTS. Every account, place, and post below was
// invented for this demo. Places use obviously made-up names (示例市 = "Sample City",
// 虚构县 = "Fictional County", 样本河 = "Sample River"). Accounts all start with
// "sample_" or "示例". Nothing here is attributed to a real person or account.
//
// Run: node scripts/make-sample.mjs
import { mkdirSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'data', 'sample', 'snapshots');
const NOTICE = 'Sample data for demo, not real posts';

// Capture times, written in Beijing time (UTC+8). Index numbers are used below.
const CAPTURES = [
  '2026-09-01T09:00:00+08:00', // 0
  '2026-09-02T09:00:00+08:00', // 1
  '2026-09-03T09:00:00+08:00', // 2
  '2026-09-04T09:00:00+08:00', // 3
  '2026-09-05T09:00:00+08:00', // 4
  '2026-09-05T16:20:00Z', //      5  (= 00:20 Beijing on Sep 6, just after midnight)
  '2026-09-06T09:00:00+08:00', // 6
  '2026-09-07T09:00:00+08:00', // 7  (a broken capture: the scraper only got 2 posts)
  '2026-09-08T09:00:00+08:00', // 8
];
const BROKEN = 7;

// Fictional accounts.
const A = {
  cat: 'sample_bamboo_cat 示例_竹林小猫',
  tea: 'sample_teapot_uncle 示例_茶壶大叔',
  rain: 'sample_rainy_window 示例_雨窗',
  bike: 'sample_blue_bicycle 示例_蓝色单车',
  noodle: 'sample_noodle_stand 示例_面馆老板',
  owl: 'sample_night_owl 示例_夜猫子',
  kite: 'sample_paper_kite 示例_纸风筝',
  river: 'sample_river_watch 示例_样本河观察',
};

// gone = first capture index where the post is missing (undefined = never deleted).
// edit = { at, text } changes the text from that capture on.
// gap = [from, to) capture indexes where the post is temporarily missing.
const POSTS = [
  { id: 's001', acct: A.cat, posted: '2026-08-31T21:10:00+08:00', gone: 1,
    text: '示例市化工厂昨晚又冒黑烟，整条街都是味道，孩子咳了一夜。',
    gloss: 'The Sample City chemical plant was pouring out black smoke again last night. The whole street smells, and my kid coughed all night.' },
  { id: 's002', acct: A.tea, posted: '2026-08-31T19:00:00+08:00',
    text: '今天泡了一壶新茶，配月饼刚好。',
    gloss: 'Brewed a pot of new tea today. Perfect with mooncakes.' },
  { id: 's003', acct: A.noodle, posted: '2026-09-01T07:30:00+08:00', gone: 2,
    text: '虚构县学校食堂用过期的肉，家长们在群里都炸了。',
    gloss: 'A school cafeteria in Fictional County used expired meat. Parents in the group chat are furious.' },
  { id: 's004', acct: A.bike, posted: '2026-09-01T08:15:00+08:00',
    text: '早高峰骑车上班，比地铁还快。',
    gloss: 'Biked to work in rush hour. Faster than the subway.' },
  { id: 's005', acct: A.rain, posted: '2026-09-01T12:40:00+08:00', gone: 3,
    edit: { at: 2, text: '样本河边的工地，听说工资还没发。' },
    text: '样本河边的工地，三个月没发工资了，工人们今天去讨薪。',
    gloss: 'The building site by Sample River has not paid wages in three months. Workers went to demand their pay today.' },
  { id: 's006', acct: A.owl, posted: '2026-09-01T23:55:00+08:00', gone: 2,
    text: '刚才那条帖子被删了，再发一次：示例市化工厂昨晚又冒黑烟。',
    gloss: 'My last post got deleted, posting again: the Sample City chemical plant was pouring out black smoke again last night.' },
  { id: 's007', acct: A.kite, posted: '2026-09-02T10:00:00+08:00',
    text: '周末去放风筝，天气太好了。',
    gloss: 'Flew a kite this weekend. Gorgeous weather.' },
  { id: 's008', acct: A.river, posted: '2026-09-02T14:20:00+08:00', gone: 3,
    text: '暴雨之后虚构县的老桥倒塌了，救援队还在找人。',
    gloss: 'After the heavy rain, the old bridge in Fictional County collapsed. Rescue teams are still searching for people.' },
  { id: 's009', acct: A.cat, posted: '2026-09-02T18:05:00+08:00', gone: 3,
    text: '示例小区烂尾三年，业主们商量要不要停贷。',
    gloss: 'Our Sample Estate housing project has sat unfinished for three years. Homeowners are discussing stopping mortgage payments.' },
  { id: 's010', acct: A.tea, posted: '2026-09-02T20:30:00+08:00', gone: 6, gap: [3, 4],
    text: '示例市医院发烧门诊排了四个小时，病人都坐在走廊。',
    gloss: 'The fever clinic at a Sample City hospital had a four-hour line. Patients were sitting in the hallway.' },
  { id: 's011', acct: A.noodle, posted: '2026-09-03T06:50:00+08:00',
    text: '今天的牛肉面加了新辣椒，欢迎来尝。',
    gloss: 'Added a new chili to today\'s beef noodles. Come try it.' },
  { id: 's012', acct: A.bike, posted: '2026-09-03T11:11:00+08:00', gone: 4,
    text: '示例市一位领导的亲戚中标了全部路灯工程，大家怎么看？',
    gloss: 'A relative of a Sample City official won every streetlight contract. What does everyone think?' },
  { id: 's013', acct: A.owl, posted: '2026-09-03T15:00:00+08:00',
    text: '有人知道哪家书店开到半夜吗？',
    gloss: 'Does anyone know a bookstore that stays open until midnight?' },
  { id: 's014', acct: A.rain, posted: '2026-09-03T22:40:00+08:00', gone: 4,
    text: '业主们在售楼处门口拉横幅维权，要求按时交房。',
    gloss: 'Homeowners held up a banner outside the sales office, demanding their homes be delivered on time.' },
  { id: 's015', acct: A.kite, posted: '2026-09-04T08:30:00+08:00', gone: 5,
    text: '我的上一条被删帖了，说是有敏感词。到底哪个词？',
    gloss: 'My last post was deleted for a "sensitive word". Which word, though?' },
  { id: 's016', acct: A.river, posted: '2026-09-04T10:10:00+08:00',
    text: '样本河今天水位回落了，河边散步的人又多了。',
    gloss: 'Sample River\'s water level dropped today. More people are walking along the bank again.' },
  { id: 's017', acct: A.cat, posted: '2026-09-04T13:45:00+08:00', gone: 5,
    text: '虚构县婴儿奶粉抽检不合格的名单，为什么不公布？',
    gloss: 'Why has Fictional County not published the list of baby formula brands that failed inspection?' },
  { id: 's018', acct: A.tea, posted: '2026-09-04T19:20:00+08:00', gone: 6,
    text: '听说示例市疫苗接种点换了供应商，有人知道是哪家吗？',
    gloss: 'I heard the Sample City vaccine site changed suppliers. Does anyone know which one?' },
  { id: 's019', acct: A.noodle, posted: '2026-09-05T07:00:00+08:00', gone: 5,
    text: '工厂停工了，老板跑了，二百多人的工资没人管。',
    gloss: 'The factory has stopped work and the boss ran off. Over two hundred people\'s wages are unpaid.' },
  { id: 's020', acct: A.bike, posted: '2026-09-05T09:30:00+08:00',
    text: '新开的自行车道很好用，点赞。',
    gloss: 'The new bike lane works great. Thumbs up.' },
  { id: 's021', acct: A.owl, posted: '2026-09-05T08:00:00+08:00', gone: 6,
    text: '示例广场下午有很多人聚集，好像是在请愿。',
    gloss: 'A lot of people gathered at Sample Square this afternoon. It looked like a petition.' },
  { id: 's022', acct: A.rain, posted: '2026-09-05T08:30:00+08:00', gone: 6,
    edit: { at: 5, text: '示例广场今天人很多。' },
    text: '示例广场今天人很多，有人举着牌子，警察也来了。',
    gloss: 'Sample Square was crowded today. Some people held signs, and the police came too.' },
  { id: 's023', acct: A.kite, posted: '2026-09-05T20:00:00+08:00',
    text: '晚饭做了红烧肉，第一次成功。',
    gloss: 'Made braised pork for dinner. First time it worked.' },
  { id: 's024', acct: A.river, posted: '2026-09-06T07:40:00+08:00', gone: 8,
    text: '虚构县化工厂排放的污水流进样本河，鱼死了一片。',
    gloss: 'Wastewater from the Fictional County chemical plant flowed into Sample River. A stretch of fish died.' },
  { id: 's025', acct: A.cat, posted: '2026-09-06T08:20:00+08:00', gone: 8,
    text: '示例市问责名单出来了，为什么只有小官？',
    gloss: 'The Sample City accountability list is out. Why are only junior officials on it?' },
  { id: 's026', acct: A.tea, posted: '2026-09-06T08:45:00+08:00',
    text: '秋天到了，公园的桂花开了。',
    gloss: 'Autumn is here. The osmanthus in the park is blooming.' },
  { id: 's027', acct: A.noodle, posted: '2026-09-06T08:00:00+08:00', gone: 8,
    text: '朋友的账号被封号了，只因为转发了一条讨薪视频。',
    gloss: 'A friend\'s account was banned just for sharing a video about unpaid wages.' },
  { id: 's028', acct: A.bike, posted: '2026-09-07T16:00:00+08:00',
    text: '有没有人周末一起骑车去郊外？',
    gloss: 'Anyone want to bike out to the countryside this weekend?' },
  { id: 's029', acct: A.owl, posted: '2026-09-07T22:10:00+08:00',
    text: '今晚的月亮好圆。',
    gloss: 'The moon is so round tonight.' },
  // A word-for-word re-post of s003 by another account, after s003 vanished.
  { id: 's030', acct: A.kite, posted: '2026-09-02T21:00:00+08:00', gone: 3,
    text: '虚构县学校食堂用过期的肉，家长们在群里都炸了。',
    gloss: 'A school cafeteria in Fictional County used expired meat. Parents in the group chat are furious.' },
  // Never seen: posted after one capture and gone before the next, so no snapshot
  // ever holds it. The engine cannot report it. This is a real blind spot of the method.
  { id: 's031', acct: A.rain, posted: '2026-09-05T12:00:00+08:00', gone: 5,
    text: '这条帖子在两次抓取之间发出又被删掉，所以没人看得到。',
    gloss: 'This post went up and came down between two captures, so nobody can see it here.' },
];

function visibleAt(p, i) {
  const t = Date.parse(CAPTURES[i]);
  if (Date.parse(p.posted) > t) return false;
  if (p.gone !== undefined && i >= p.gone) return false;
  if (p.gap && i >= p.gap[0] && i < p.gap[1]) return false;
  return true;
}

mkdirSync(outDir, { recursive: true });
for (const f of readdirSync(outDir)) if (f.endsWith('.json')) unlinkSync(join(outDir, f));

CAPTURES.forEach((at, i) => {
  let posts = POSTS.filter((p) => visibleAt(p, i)).map((p) => ({
    id: p.id,
    account: p.acct,
    posted_at: p.posted,
    text: p.edit && i >= p.edit.at ? p.edit.text : p.text,
    gloss: p.gloss,
  }));
  if (i === BROKEN) posts = posts.slice(0, 2);
  const snap = {
    sample: true,
    notice: NOTICE,
    platform: 'sample-microblog (fictional)',
    captured_at: at,
    note: i === BROKEN ? 'Deliberately broken capture: the pretend scraper only saved 2 posts. The engine should ignore it.' : undefined,
    posts,
  };
  const name = `${String(i).padStart(2, '0')}-${at.replace(/[:]/g, '').replace(/\+0800$/, 'p0800')}.json`;
  writeFileSync(join(outDir, name), JSON.stringify(snap, null, 2) + '\n');
});
console.log(`wrote ${CAPTURES.length} sample snapshots to ${outDir}`);
