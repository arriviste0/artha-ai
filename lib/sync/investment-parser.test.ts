import { describe, expect, it } from "vitest"
import { parseInvestmentPurchaseAlert } from "./investment-parser"

describe("parseInvestmentPurchaseAlert", () => {
  it("parses a completed stock purchase with trade details", () => {
    const result = parseInvestmentPurchaseAlert(
      "Groww order executed. Stock Name: Reliance Industries Limited Quantity: 4 Order Value: ₹12,345.67",
      new Date("2026-11-11T10:00:00.000Z")
    )

    expect(result).toMatchObject({
      name: "Reliance Industries Limited",
      instrument: "stock",
      units: 4,
      investedPaise: 1234567,
    })
  })

  it("parses mutual fund SIP purchases and rejects sell confirmations", () => {
    const purchase = parseInvestmentPurchaseAlert(
      "SIP purchase successful. Scheme Name: HDFC Flexi Cap Fund Units: 12.345 Investment Amount: INR 5000",
      new Date("2026-11-11T10:00:00.000Z")
    )
    const sale = parseInvestmentPurchaseAlert(
      "Your order has been executed. Sold 4 shares. Order Value: ₹12,345",
      new Date("2026-11-11T10:00:00.000Z")
    )

    expect(purchase).toMatchObject({
      name: "HDFC Flexi Cap Fund",
      instrument: "mutual_fund",
      units: 12.345,
      investedPaise: 500000,
    })
    expect(sale).toBeNull()
  })
})
