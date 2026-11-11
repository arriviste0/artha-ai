import { describe, it, expect } from "vitest"
import {
  detectCardBillPayment,
  extractStatementTokens,
  parseGenericAmount,
  parseGenericDate,
  parseGenericReference,
  pairMatchCardBillPayments,
  calculateReportTotals,
  isIgnoredNonTransaction,
} from "./card-bill-detector"
import { parseTransactionAlert } from "./parser"
import { BANK_ALIASES, BILL_PAYMENT_KEYWORDS } from "./card-bill-config"

describe("Credit Card Bill Payment Detector & Parsing System", () => {
  // Test 1: Full narration with billpay code, bank token, masked 16-digit card, 16-digit ref, date 30/10/26, amount 12,082.41
  it("Fixture 1: Parses narration with billpay code, bank token, masked card, 16-digit ref, date and amount", async () => {
    // Construct sample without hardcoding specific banks or numbers
    const sample = "IB BILLPAY HDFC 4585XXXXXXXX8377 9876543210123456 30/10/26 Rs. 12,082.41 DR"

    const detection = detectCardBillPayment(sample, "debit")
    expect(detection.isCardBillPayment).toBe(true)
    expect(detection.confidence).toBeGreaterThanOrEqual(0.8)
    expect(detection.cardLast4).toBe("8377")
    expect(detection.issuerGuess).toBe("HDFC Bank")

    const tokens = extractStatementTokens(sample)
    expect(tokens.cardLast4).toBe("8377")
    expect(tokens.amount).toBe(12082.41)
    expect(tokens.amountPaise).toBe(1208241)
    expect(tokens.refNo).toBe("9876543210123456")

    const date = tokens.date!
    expect(date.getUTCDate()).toBe(30)
    expect(date.getUTCMonth()).toBe(9) // 0-indexed October
    expect(date.getUTCFullYear()).toBe(2026)

    const parsed = await parseTransactionAlert(sample, "email_sync")
    expect(parsed).not.toBeNull()
    expect(parsed?.category).toBe("Transfer")
    expect(parsed?.subtype).toBe("card_bill_payment")
    expect(parsed?.amountPaise).toBe(1208241)
    expect(parsed?.cardLast4).toBe("8377")
    expect(parsed?.referenceNumber).toBe("9876543210123456")
  })

  // Test 2: The same pattern with ICICI, SBI, Axis, Kotak, IDFC, Amex, and an unlisted bank
  it("Fixture 2: Detects card payment across multiple banks, and sets issuerGuess = unknown for unlisted bank", () => {
    const banks = [
      { token: "ICICI", expectedIssuer: "ICICI Bank" },
      { token: "SBI", expectedIssuer: "State Bank of India" },
      { token: "AXIS", expectedIssuer: "Axis Bank" },
      { token: "KOTAK", expectedIssuer: "Kotak Mahindra Bank" },
      { token: "IDFC", expectedIssuer: "IDFC FIRST Bank" },
      { token: "AMEX", expectedIssuer: "American Express" },
      { token: "NEWMONEYBANK", expectedIssuer: "unknown" },
    ]

    for (const { token, expectedIssuer } of banks) {
      const text = `AUTOPAY ${token} CARD 5241XXXXXXXX9922 REF449911223344 15/11/26 INR 5,432.10`
      const result = detectCardBillPayment(text, "debit")

      expect(result.isCardBillPayment).toBe(true)
      expect(result.confidence).toBeGreaterThanOrEqual(0.8)
      expect(result.cardLast4).toBe("9922")
      expect(result.issuerGuess).toBe(expectedIssuer)
    }
  })

  // Test 3: "CC PAYMENT RECEIVED" credit on a card statement -> card-side payment, paired with bank debit
  it("Fixture 3: Pairs card-side 'CC PAYMENT RECEIVED' credit with bank debit when amounts match within 5 days", () => {
    const bankDebit: {
      _id: string
      amountPaise: number
      occurredAt: Date
      type: "debit"
      category: string
      subtype: string
      cardLast4: string
      linkedTransactionId?: string
    } = {
      _id: "txn_bank_debit_1",
      amountPaise: 1208241,
      occurredAt: new Date("2026-10-30T10:00:00Z"),
      type: "debit" as const,
      category: "Transfer",
      subtype: "card_bill_payment",
      cardLast4: "8377",
    }

    const cardCreditNarration = "CC PAYMENT RECEIVED - THANK YOU 4585XXXXXXXX8377 31/10/26 12,082.41 CR"
    const cardDetection = detectCardBillPayment(cardCreditNarration, "credit")
    expect(cardDetection.isCardBillPayment).toBe(true)
    expect(cardDetection.direction).toBe("credit")

    const cardCredit: {
      _id: string
      amountPaise: number
      occurredAt: Date
      type: "credit"
      category: string
      subtype: string
      cardLast4: string
      linkedTransactionId?: string
    } = {
      _id: "txn_card_credit_1",
      amountPaise: 1208241,
      occurredAt: new Date("2026-10-31T05:00:00Z"),
      type: "credit" as const,
      category: "Transfer",
      subtype: "card_bill_payment",
      cardLast4: "8377",
    }

    const { linkedCount, transactions } = pairMatchCardBillPayments([bankDebit, cardCredit])
    expect(linkedCount).toBe(1)
    expect(transactions[0].linkedTransactionId).toBe("txn_card_credit_1")
    expect(transactions[1].linkedTransactionId).toBe("txn_bank_debit_1")
  })

  // Test 4: Same amount on two different cards -> NOT paired
  it("Fixture 4: Does NOT pair transactions with the same amount if they are for different cards", () => {
    const debitCardA: {
      _id: string
      amountPaise: number
      occurredAt: Date
      type: "debit"
      category: string
      subtype: string
      cardLast4: string
      linkedTransactionId?: string
    } = {
      _id: "txn_debit_cardA",
      amountPaise: 1208241,
      occurredAt: new Date("2026-10-30T10:00:00Z"),
      type: "debit" as const,
      category: "Transfer",
      subtype: "card_bill_payment",
      cardLast4: "1111",
    }

    const creditCardB: {
      _id: string
      amountPaise: number
      occurredAt: Date
      type: "credit"
      category: string
      subtype: string
      cardLast4: string
      linkedTransactionId?: string
    } = {
      _id: "txn_credit_cardB",
      amountPaise: 1208241,
      occurredAt: new Date("2026-10-31T12:00:00Z"),
      type: "credit" as const,
      category: "Transfer",
      subtype: "card_bill_payment",
      cardLast4: "2222",
    }

    const { linkedCount, transactions } = pairMatchCardBillPayments([debitCardA, creditCardB])
    expect(linkedCount).toBe(0)
    expect(transactions[0].linkedTransactionId).toBeUndefined()
    expect(transactions[1].linkedTransactionId).toBeUndefined()
  })

  // Test 5: "UPI-SWIGGY ..." with no card signals -> not a card bill payment
  it("Fixture 5: 'UPI-SWIGGY ...' without card signals is NOT classified as card bill payment", () => {
    const upiSwiggy = "UPI-SWIGGY-swiggy@icici-123456789012-Order Payment"
    const result = detectCardBillPayment(upiSwiggy, "debit")
    expect(result.isCardBillPayment).toBe(false)
    expect(result.confidence).toBeLessThan(0.5)
  })

  // Test 6: A person's name paying 12,082.41 by UPI -> not a card bill payment
  it("Fixture 6: UPI payment to a person's name is NOT a card bill payment", () => {
    const upiPerson = "Rs.12082.41 debited from a/c ending 1234 towards VPA rahul.sharma@okaxis UPI Ref 998877665544"
    const result = detectCardBillPayment(upiPerson, "debit")
    expect(result.isCardBillPayment).toBe(false)
    expect(result.confidence).toBeLessThan(0.5)
  })

  // Test 7: OTP message and promo message -> ignored, never reach the queue
  it("Fixture 7: OTP messages and promo messages are ignored and return null", async () => {
    const otpMsg = "Your OTP for login is 482910. Do not share this secret code with anyone. Valid for 10 min."
    const promoMsg = "Exclusive festive treat! Save up to Rs. 5000 on your next shopping spree. Apply now!"
    const balanceMsg = "Your available balance is Rs. 45,210.50 in a/c ending 9821."

    expect(isIgnoredNonTransaction(otpMsg)).toBe(true)
    expect(isIgnoredNonTransaction(promoMsg)).toBe(true)
    expect(isIgnoredNonTransaction(balanceMsg)).toBe(true)

    const parsedOtp = await parseTransactionAlert(otpMsg, "sms_sync")
    const parsedPromo = await parseTransactionAlert(promoMsg, "email_sync")
    const parsedBalance = await parseTransactionAlert(balanceMsg, "sms_sync")

    expect(parsedOtp).toBeNull()
    expect(parsedPromo).toBeNull()
    expect(parsedBalance).toBeNull()
  })

  // Test 8: An unreadable narration must not create a guessed transaction.
  it("Fixture 8: Cryptic/unreadable transaction-like alert is skipped", async () => {
    const crypticNarration = "SYS_TXN_NODE_88319_CODE_A99 1500.00 01/11/26 REF908123746198"

    const parsed = await parseTransactionAlert(crypticNarration, "sms_sync")
    expect(parsed).toBeNull()
  })

  // Test 9: Indian comma formats and 5 date formats parse correctly
  it("Fixture 9: Parses Indian currency comma formats and 5 standard date formats", () => {
    // Currency formatting
    expect(parseGenericAmount("12,082.41")).toBe(12082.41)
    expect(parseGenericAmount("1,20,000")).toBe(120000)
    expect(parseGenericAmount("Rs.500")).toBe(500)
    expect(parseGenericAmount("INR 500.00")).toBe(500)
    expect(parseGenericAmount("Rs 5,000/-")).toBe(5000)

    // 5 Date formats
    // Format 1: dd/mm/yy
    const d1 = parseGenericDate("30/10/26")
    expect(d1.getUTCDate()).toBe(30)
    expect(d1.getUTCMonth()).toBe(9)
    expect(d1.getUTCFullYear()).toBe(2026)

    // Format 2: dd/mm/yyyy
    const d2 = parseGenericDate("30/10/2026")
    expect(d2.getUTCDate()).toBe(30)
    expect(d2.getUTCMonth()).toBe(9)
    expect(d2.getUTCFullYear()).toBe(2026)

    // Format 3: dd-MM-yy
    const d3 = parseGenericDate("30-10-26")
    expect(d3.getUTCDate()).toBe(30)
    expect(d3.getUTCMonth()).toBe(9)
    expect(d3.getUTCFullYear()).toBe(2026)

    // Format 4: dd-Mon-yyyy
    const d4 = parseGenericDate("30-OCT-2026")
    expect(d4.getUTCDate()).toBe(30)
    expect(d4.getUTCMonth()).toBe(9)
    expect(d4.getUTCFullYear()).toBe(2026)

    // Format 5: dd MMM yy
    const d5 = parseGenericDate("30 Oct 26")
    expect(d5.getUTCDate()).toBe(30)
    expect(d5.getUTCMonth()).toBe(9)
    expect(d5.getUTCFullYear()).toBe(2026)
  })

  // Test 10: Report totals: expense total excludes card bill payments
  it("Fixture 10: Report totals exclude card bill payments and transfers to prevent double-counting", () => {
    const transactions = [
      // Regular expense: 500 rupees
      { amountPaise: 50000, type: "debit" as const, category: "Food & Dining" },
      // Card bill payment bank debit: 12,082.41 rupees (MUST NOT be counted in expenses!)
      { amountPaise: 1208241, type: "debit" as const, category: "Transfer", subtype: "card_bill_payment" },
      // Card-side payment received credit: 12,082.41 rupees (MUST NOT be counted in income!)
      { amountPaise: 1208241, type: "credit" as const, category: "Transfer", subtype: "card_bill_payment" },
      // Regular income: 75,000 rupees
      { amountPaise: 7500000, type: "credit" as const, category: "Salary" },
    ]

    const totals = calculateReportTotals(transactions)
    expect(totals.totalExpensesPaise).toBe(50000) // Exactly 500 rupees, 12,082.41 is excluded!
    expect(totals.totalIncomePaise).toBe(7500000) // Exactly 75,000 rupees, 12,082.41 is excluded!
    expect(totals.netSavingsPaise).toBe(7500000 - 50000)
  })

  // Test 11: Statement lines with different token orderings
  it("Extracts tokens by pattern regardless of ordering in statement lines", () => {
    // Ordering A: [Narration] [Card] [Ref] [Date] [Amount]
    const lineA = "BILLPAY BBPS 463202XXXXXX1234 1002003004005006 14-11-26 Rs. 8,500.00"
    const tokensA = extractStatementTokens(lineA)
    expect(tokensA.cardLast4).toBe("1234")
    expect(tokensA.refNo).toBe("1002003004005006")
    expect(tokensA.amount).toBe(8500)
    expect(tokensA.date?.getUTCDate()).toBe(14)

    // Ordering B: [Date] [Amount] [Narration] [Card] [Ref]
    const lineB = "14-11-26 Rs. 8,500.00 BILLPAY BBPS 463202XXXXXX1234 1002003004005006"
    const tokensB = extractStatementTokens(lineB)
    expect(tokensB.cardLast4).toBe("1234")
    expect(tokensB.refNo).toBe("1002003004005006")
    expect(tokensB.amount).toBe(8500)
    expect(tokensB.date?.getUTCDate()).toBe(14)

    // Ordering C: [Amount] [Ref] [Card] [Date] [Narration]
    const lineC = "Rs. 8,500.00 1002003004005006 463202XXXXXX1234 14-11-26 BILLPAY BBPS"
    const tokensC = extractStatementTokens(lineC)
    expect(tokensC.cardLast4).toBe("1234")
    expect(tokensC.refNo).toBe("1002003004005006")
    expect(tokensC.amount).toBe(8500)
    expect(tokensC.date?.getUTCDate()).toBe(14)
  })
})
