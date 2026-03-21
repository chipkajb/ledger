import { addMonths, format, parseISO } from "date-fns";

export interface MortgageParams {
  loanAmount: number;
  annualRate: number; // decimal e.g. 0.0599
  termYears: number;
  paymentsPerYear: number;
  firstPaymentDate: string; // YYYY-MM-DD
  monthlyEscrow: number;
  pmi: number;
  housePrice: number;
  downPayment: number;
}

export interface ExtraPayment {
  paymentDate: string; // YYYY-MM-DD
  amount: number;
}

export interface AmortizationRow {
  paymentNumber: number;
  date: string; // YYYY-MM-DD
  payment: number; // P&I only
  principal: number;
  interest: number;
  pmi: number;
  escrow: number;
  extraPayment: number;
  totalPayment: number; // payment + escrow + extra
  endingBalance: number;
  homeEquity: number;
  equityPct: number;
}

export interface MortgageSummary {
  monthlyPayment: number; // P&I
  totalMonthlyPayment: number; // P&I + escrow
  totalPayments: number;
  totalInterest: number;
  totalPmi: number;
  totalExtraPayments: number;
  moneySaved: number; // vs no extra payments
  payoffDate: string;
  termMonths: number; // actual months to payoff
  originalTermMonths: number;
  monthsSaved: number;
  currentBalance: number; // balance as of today
  currentEquity: number;
  currentEquityPct: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function calcMonthlyPayment(
  loanAmount: number,
  annualRate: number,
  termYears: number,
  paymentsPerYear = 12
): number {
  const r = annualRate / paymentsPerYear;
  const n = termYears * paymentsPerYear;
  if (r === 0) return round2(loanAmount / n);
  const payment = loanAmount * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  return round2(payment);
}

export function generateSchedule(
  params: MortgageParams,
  extraPayments: ExtraPayment[] = []
): { rows: AmortizationRow[]; summary: MortgageSummary } {
  const { loanAmount, annualRate, termYears, paymentsPerYear, firstPaymentDate, monthlyEscrow, pmi, housePrice } = params;

  const r = annualRate / paymentsPerYear;
  const n = termYears * paymentsPerYear;
  const monthlyPayment = calcMonthlyPayment(loanAmount, annualRate, termYears, paymentsPerYear);

  // Build extra payments map: paymentDate -> amount
  const extraMap = new Map<string, number>();
  for (const ep of extraPayments) {
    const existing = extraMap.get(ep.paymentDate) ?? 0;
    extraMap.set(ep.paymentDate, existing + ep.amount);
  }

  // Calculate baseline total interest (no extras) for money-saved calculation
  const baselineInterest = calcTotalInterest(loanAmount, annualRate, termYears, paymentsPerYear);

  const rows: AmortizationRow[] = [];
  let balance = loanAmount;
  let paymentNumber = 1;
  const firstDate = parseISO(firstPaymentDate);

  while (balance > 0.005 && paymentNumber <= n + 120) {
    const date = addMonths(firstDate, paymentNumber - 1);
    const dateStr = format(date, "yyyy-MM-dd");

    const interest = round2(balance * r);
    let principal = round2(monthlyPayment - interest);

    // Cap principal at remaining balance
    if (principal > balance) principal = round2(balance);

    const extra = round2(extraMap.get(dateStr) ?? 0);
    const actualPmi = balance > housePrice * 0.8 ? pmi : 0;

    let endingBalance = round2(balance - principal - extra);
    if (endingBalance < 0) endingBalance = 0;

    const actualPayment = round2(interest + principal);
    const totalPayment = round2(actualPayment + monthlyEscrow + actualPmi + extra);

    rows.push({
      paymentNumber,
      date: dateStr,
      payment: actualPayment,
      principal,
      interest,
      pmi: actualPmi,
      escrow: monthlyEscrow,
      extraPayment: extra,
      totalPayment,
      endingBalance,
      homeEquity: round2(housePrice - endingBalance),
      equityPct: round2(((housePrice - endingBalance) / housePrice) * 100),
    });

    balance = endingBalance;
    paymentNumber++;

    if (balance <= 0) break;
  }

  const totalInterest = round2(rows.reduce((s, r) => s + r.interest, 0));
  const totalPmiSum = round2(rows.reduce((s, r) => s + r.pmi, 0));
  const totalExtra = round2(rows.reduce((s, r) => s + r.extraPayment, 0));
  const moneySaved = round2(baselineInterest - totalInterest);

  const payoffRow = rows[rows.length - 1];
  const payoffDate = payoffRow?.date ?? firstPaymentDate;
  const termMonths = rows.length;
  const originalTermMonths = n;
  const monthsSaved = originalTermMonths - termMonths;

  // Current balance (find row matching today or closest past date)
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const pastRows = rows.filter((r) => r.date <= todayStr);
  const currentRow = pastRows.length > 0 ? pastRows[pastRows.length - 1] : null;
  const currentBalance = currentRow?.endingBalance ?? loanAmount;
  const currentEquity = round2(housePrice - currentBalance);
  const currentEquityPct = round2((currentEquity / housePrice) * 100);

  return {
    rows,
    summary: {
      monthlyPayment,
      totalMonthlyPayment: round2(monthlyPayment + monthlyEscrow),
      totalPayments: round2(rows.reduce((s, r) => s + r.totalPayment, 0)),
      totalInterest,
      totalPmi: totalPmiSum,
      totalExtraPayments: totalExtra,
      moneySaved,
      payoffDate,
      termMonths,
      originalTermMonths,
      monthsSaved,
      currentBalance,
      currentEquity,
      currentEquityPct,
    },
  };
}

function calcTotalInterest(
  loanAmount: number,
  annualRate: number,
  termYears: number,
  paymentsPerYear: number
): number {
  const r = annualRate / paymentsPerYear;
  const n = termYears * paymentsPerYear;
  const monthlyPayment = calcMonthlyPayment(loanAmount, annualRate, termYears, paymentsPerYear);
  let balance = loanAmount;
  let totalInterest = 0;
  for (let i = 0; i < n && balance > 0.005; i++) {
    const interest = balance * r;
    const principal = Math.min(monthlyPayment - interest, balance);
    totalInterest += interest;
    balance -= principal;
  }
  return round2(totalInterest);
}
