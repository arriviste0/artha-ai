/** Financial calculation utilities. All amounts are in paise unless noted. */

/** XIRR: Newton-Raphson solver for irregular cash flows. */
export function xirr(
  cashflows: { amount: number; date: Date }[],
  guess = 0.1
): number | null {
  if (cashflows.length < 2) return null

  const tol = 1e-6
  const maxIter = 100
  const t0 = cashflows[0].date.getTime()

  function npv(rate: number): number {
    return cashflows.reduce((sum, cf) => {
      const years = (cf.date.getTime() - t0) / (365.25 * 24 * 3600 * 1000)
      return sum + cf.amount / Math.pow(1 + rate, years)
    }, 0)
  }

  function dnpv(rate: number): number {
    return cashflows.reduce((sum, cf) => {
      const years = (cf.date.getTime() - t0) / (365.25 * 24 * 3600 * 1000)
      return sum - (years * cf.amount) / Math.pow(1 + rate, years + 1)
    }, 0)
  }

  let rate = guess
  for (let i = 0; i < maxIter; i++) {
    const f = npv(rate)
    const df = dnpv(rate)
    if (Math.abs(df) < 1e-12) return null
    const newRate = rate - f / df
    if (Math.abs(newRate - rate) < tol) return newRate
    rate = newRate
  }
  return null
}

/** CAGR between two dates given invested and current value (in paise). */
export function cagr(investedPaise: number, currentValuePaise: number, years: number): number {
  if (investedPaise <= 0 || years <= 0) return 0
  return Math.pow(currentValuePaise / investedPaise, 1 / years) - 1
}

/** Savings rate as a fraction (0–1). */
export function savingsRate(incomePaise: number, expensesPaise: number): number {
  if (incomePaise <= 0) return 0
  return Math.max(0, (incomePaise - expensesPaise) / incomePaise)
}

/**
 * Emergency fund runway in months given current fund and monthly essential expenses.
 * Both in paise.
 */
export function emergencyRunwayMonths(
  emergencyFundPaise: number,
  monthlyExpensesPaise: number
): number {
  if (monthlyExpensesPaise <= 0) return Infinity
  return emergencyFundPaise / monthlyExpensesPaise
}

/** Recommended emergency fund target in paise. */
export function recommendedEmergencyFund(
  monthlyEssentialsPaise: number,
  incomeMode: "salaried" | "variable" | "business"
): number {
  const multiplier = incomeMode === "salaried" ? 6 : 9
  return monthlyEssentialsPaise * multiplier
}

/** Volatility score (0–100) based on coefficient of variation of monthly income samples. */
export function volatilityScore(monthlyIncomes: number[]): number {
  if (monthlyIncomes.length < 2) return 0
  const mean = monthlyIncomes.reduce((s, v) => s + v, 0) / monthlyIncomes.length
  if (mean === 0) return 0
  const variance =
    monthlyIncomes.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / monthlyIncomes.length
  const cv = Math.sqrt(variance) / mean
  return Math.min(100, Math.round(cv * 100))
}
