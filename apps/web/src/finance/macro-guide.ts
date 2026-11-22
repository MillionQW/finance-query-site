interface MacroGuide {
  title: string;
  purpose: string;
  levels: string;
  implication: string;
  reference: string;
}

const pmiReference = 'https://www.stats.gov.cn/zs/tjws/tjzb/202301/t20230101_1903972.html';
const creditReference = 'https://www.pbc.gov.cn/diaochatongjisi/116219/116319/index.html';

export const macroGuide: Partial<Record<string, MacroGuide>> = {
  pmi: {
    title: '制造业 PMI 总指数',
    purpose: '综合观察制造业相对上月的景气变化，覆盖生产、订单、用工等环节。',
    levels: '50 点是荣枯线，对应较上月大体持平。高于 50 表示扩张，低于 50 表示收缩。由 47 升到 49，意味着收缩势头减弱。',
    implication: '连续回升且新订单同步改善，需求改善的证据更充分。可以用行业销量和公司收入验证。',
    reference: pmiReference
  },
  'pmi-orders': {
    title: '制造业 PMI 新订单',
    purpose: '观察制造业接单情况相对上月的变化，反映企业需求端的景气方向。',
    levels: '高于 50 表示新订单较上月增加，低于 50 表示减少。总指数回升而新订单仍低于 50 时，可检查改善是否主要来自生产等其他分项。',
    implication: '若新订单持续上行，可结合企业在手订单、库存和交付周期，判断需求能否转化为未来收入。',
    reference: pmiReference
  },
  cpi: {
    title: 'CPI 同比',
    purpose: '观察居民购买的商品和服务价格相对上年同期的变化。',
    levels: '高于 0% 表示价格水平高于上年同期，低于 0% 表示低于上年同期。同比由 2% 降到 1%，意味着价格仍高于去年同期，涨幅收窄。',
    implication: '观察价格压力时，可以结合核心 CPI 和环比，辨别变化来自食品、能源、去年同期基数，还是更广泛的价格变化。',
    reference: 'https://www.stats.gov.cn/zs/tjws/tjzb/202301/t20230101_1903757.html'
  },
  ppi: {
    title: 'PPI 同比',
    purpose: '观察工业品出厂价格相对上年同期的变化，辅助判断工业企业的售价环境。',
    levels: '高于 0% 表示出厂价格同比上涨，低于 0% 表示同比下降。由负转正时，可以结合环比和行业分项判断涨价范围。',
    implication: '上游售价上涨可能改善收入，也可能抬高下游成本。判断利润影响时，把产品售价与原料成本一起看。',
    reference: 'https://www.stats.gov.cn/xw/tjxw/tzgg/202302/t20230227_1918854.html'
  },
  retail: {
    title: '社零同比',
    purpose: '观察商品零售和餐饮收入的名义增长，用于跟踪消费需求。',
    levels: '高于 0% 表示销售额高于上年同期，低于 0% 表示低于上年同期。遇到春节错月，优先看 1–2 月合计和后续几个月。',
    implication: '连续回升有助于判断消费改善的持续性。研究具体公司时，把品类销售额与公司销量、售价放在一起看。',
    reference: 'https://www.stats.gov.cn/zs/tjws/zytjzbqs/shxfp/202502/t20250226_1958804.html'
  },
  credit: {
    title: '社融增量',
    purpose: '观察实体经济当月从金融体系获得的融资净增额，单位为亿元。',
    levels: '低于 0 表示当月融资净减少。月度数据季节性较强，优先比较去年同月及近几个月的变化。',
    implication: '单月放量时，可以拆看政府债券和实体人民币贷款，判断增加主要来自债券发行还是贷款扩张。',
    reference: creditReference
  },
  'credit-stock-yoy': {
    title: '社融存量同比',
    purpose: '观察月末融资余额相对上年同期的增速，用于跟踪信用扩张的趋势。',
    levels: '正增速说明余额比去年同期高。由 9% 降至 8% 表示余额仍增长，但增速在放缓。连续几个月的转向比单月波动更值得关注。',
    implication: '当月增量跳升而存量同比继续下行时，可以检查季节性、去年同期基数和融资分项，再判断信用是否持续回暖。',
    reference: creditReference
  },
  cn10y: {
    title: '中国 10 年期国债收益率',
    purpose: '观察人民币长期利率，为人民币资产的折现率和债券估值提供参考。',
    levels: '重点看同一历史区间内的高低位置和趋势转向。收益率上行时，同类存量固定利率债券价格通常承压。',
    implication: '其他估值假设相同，利率基准上升会压低远期现金流的现值。结合信用风险与盈利预期判断股票的整体影响。',
    reference: 'https://yield.chinabond.com.cn/cbweb-pbc-web/pbc/more?locale=cn_zh'
  },
  us10y: {
    title: '美国 10 年期国债收益率',
    purpose: '观察美元长期融资和折现环境，辅助研究美元资产以及对美元利率敏感的公司。',
    levels: '重点看持续上行或回落。两条国债曲线交叉时，中美 10 年期利差经过零附近，注意两地交易日期是否一致。',
    implication: '若美债收益率相对中债升得更快，美元债券的相对收益率上升。研判人民币和港股时，还要结合增长、风险偏好及汇率变化。',
    reference: 'https://home.treasury.gov/policy-issues/financing-the-government/interest-rate-statistics/treasury-yield-curve-methodology'
  },
  usdcny: {
    title: '美元兑人民币中间价',
    purpose: '观察 1 美元对应多少人民币的中间价，用于跟踪汇率方向和评估公司外币敞口。',
    levels: '数值上升表示人民币相对美元走弱，下降表示走强。7.00 这类整数位便于观察，判断趋势要结合持续时间和波动幅度。',
    implication: '人民币走弱时，美元净收入折成人民币通常增加，美元净负债或进口成本可能上升。实际影响取决于结算币种和套保。',
    reference: 'https://www.safe.gov.cn/safe/rmbhlzjj/index.html'
  }
};
