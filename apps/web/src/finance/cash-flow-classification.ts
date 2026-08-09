export interface CashFlowClassification {
  code: number;
  operatingSign: '+' | '-';
  investingSign: '+' | '-';
  financingSign: '+' | '-';
  companyType: string;
  focus: string;
  note?: string;
}

export const CASH_FLOW_CLASSIFICATIONS: CashFlowClassification[] = [
  { code: 1, operatingSign: '+', investingSign: '+', financingSign: '+', companyType: '妖精型', focus: '企业计划投资项目情况' },
  { code: 2, operatingSign: '+', investingSign: '+', financingSign: '-', companyType: '老母鸡型', focus: '低 PE、高股息率' },
  { code: 3, operatingSign: '+', investingSign: '-', financingSign: '+', companyType: '蛮牛型', focus: '项目前景、资金支持' },
  { code: 4, operatingSign: '+', investingSign: '-', financingSign: '-', companyType: '奶牛型', focus: '可持续性' },
  { code: 5, operatingSign: '-', investingSign: '-', financingSign: '-', companyType: '大出血型', focus: '拒绝参与' },
  { code: 6, operatingSign: '-', investingSign: '-', financingSign: '+', companyType: '赌徒型', focus: '项目前景与管理层品性' },
  { code: 7, operatingSign: '-', investingSign: '+', financingSign: '-', companyType: '混吃等死型', focus: '不建议投资', note: '亦可能是老母鸡型' },
  { code: 8, operatingSign: '-', investingSign: '+', financingSign: '+', companyType: '骗吃骗喝型', focus: '不建议投资', note: '亦可能是妖精型' }
];

export function classifyCashFlows(
  operatingCashflow: number | null,
  investingCashflow: number | null,
  financingCashflow: number | null
): CashFlowClassification | null {
  if (
    operatingCashflow === null ||
    investingCashflow === null ||
    financingCashflow === null ||
    operatingCashflow === 0 ||
    investingCashflow === 0 ||
    financingCashflow === 0
  ) {
    return null;
  }

  const signs = [operatingCashflow, investingCashflow, financingCashflow]
    .map((value) => value > 0 ? '+' : '-')
    .join('');
  return CASH_FLOW_CLASSIFICATIONS.find((item) =>
    `${item.operatingSign}${item.investingSign}${item.financingSign}` === signs
  ) ?? null;
}

export function cashFlowClassificationByCode(code: number | null): CashFlowClassification | null {
  if (code === null) return null;
  return CASH_FLOW_CLASSIFICATIONS.find((item) => item.code === code) ?? null;
}

