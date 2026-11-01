import { describe, it, expect, vi, beforeEach } from "vitest"

const mockGetDocumentProxy = vi.fn()
const mockExtractText = vi.fn()

vi.mock("unpdf", () => ({
  getDocumentProxy: (...args: any[]) => mockGetDocumentProxy(...args),
  extractText: (...args: any[]) => mockExtractText(...args),
}))

import { parsePDF } from "./pdf"

describe("PDF Statement Parser", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("should parse text bank statements with tabular transaction rows", async () => {
    const sampleStatementText = `
HDFC BANK ACCOUNT STATEMENT
Account Number: 1234567890
Statement Period: 01/10/2024 to 31/10/2024

Date       Narration                               Chq/Ref No    Debit        Credit       Balance
15/10/2024 UPI-SWIGGY-swiggy@icici-4289            428912345678  1,250.00                  48,750.00
18/10/2024 SALARY CREDIT - TECH CORP               000998811                  50,000.00    98,750.00
20/10/2024 UPI-KOHINOOR OPTICS-3876@hdfcbank       13212         2,000.00                  96,750.00
31/10/2024 UPI-PATEL VED RITESHKUMAR-3272@pthdfc   132122110     10,000.00                 86,750.00
`

    mockGetDocumentProxy.mockResolvedValue({})
    mockExtractText.mockResolvedValue({ text: sampleStatementText, totalPages: 1 })

    const fakePdfBuffer = Buffer.from("%PDF-1.7 sample fake pdf")
    const result = await parsePDF(fakePdfBuffer)

    expect(result.rows).toHaveLength(4)
    expect(result.method).toBe("pdf_text")

    // Check transaction 1: Swiggy
    const swiggy = result.rows[0]
    expect(swiggy.date).toBe("2024-10-15")
    expect(swiggy.debit).toBe(125000)
    expect(swiggy.credit).toBe(0)
    expect(swiggy.aiAssigned?.category).toBe("Food & Dining")

    // Check transaction 2: Salary
    const salary = result.rows[1]
    expect(salary.date).toBe("2024-10-18")
    expect(salary.debit).toBe(0)
    expect(salary.credit).toBe(5000000)
    expect(salary.aiAssigned?.category).toBe("Salary")

    // Check transaction 3: Kohinoor Optics
    const optics = result.rows[2]
    expect(optics.date).toBe("2024-10-20")
    expect(optics.debit).toBe(200000)
    expect(optics.credit).toBe(0)
    expect(optics.aiAssigned?.category).toBe("Healthcare")

    // Check transaction 4: Patel Ved Riteshkumar
    const transfer = result.rows[3]
    expect(transfer.date).toBe("2024-10-31")
    expect(transfer.debit).toBe(1000000)
    expect(transfer.credit).toBe(0)
  })

  it("should assemble multi-line wrapped rows and detect credits via balance delta", async () => {
    const multiLineStatement = `
HDFC BANK ACCOUNT STATEMENT
29/10/26 UPI-EURONET SERVICES 0001 30/10/26 51.00 8,602.35
30/10/26 ACH C-TECH MAHINDRA-SALARY
FOR OCT 2026 0002 30/10/26 53,661.00 62,263.35
30/10/26 IB BILLPAY DR-HDFC 0003 30/10/26 12,082.41 50,180.94
30/10/26 UPI-ZEPTO MARKETPLACE 0004 30/10/26 209.00 47,273.50
30/10/26 UPI-RAZORPAY-REFUND 0005 30/10/26 209.00 47,482.50
31/10/26 UPI-PATEL VED RITESHKUMAR
(PATEL VED) 0006 31/10/26 10,000.00 37,482.50
31/10/26 UPI-ZALAVADIYA JENIL KUM-6219@YESP 0007 31/10/26 1,000.00 38,482.50
`
    mockGetDocumentProxy.mockResolvedValue({})
    mockExtractText.mockResolvedValue({ text: multiLineStatement, totalPages: 1 })

    const fakePdfBuffer = Buffer.from("%PDF-1.7 sample fake pdf")
    const result = await parsePDF(fakePdfBuffer)

    expect(result.rows).toHaveLength(7)

    // ACH salary: credit 53,661
    expect(result.rows[1].credit).toBe(5366100)
    expect(result.rows[1].debit).toBe(0)

    // IB Billpay: debit 12,082.41
    expect(result.rows[2].debit).toBe(1208241)
    expect(result.rows[2].credit).toBe(0)

    // Razorpay refund: balance increased from 47,273.50 to 47,482.50 (+209) -> Credit!
    expect(result.rows[4].credit).toBe(20900)
    expect(result.rows[4].debit).toBe(0)

    // Patel Ved wrapped line: debit 10,000
    expect(result.rows[5].debit).toBe(1000000)
    expect(result.rows[5].credit).toBe(0)

    // Zalavadiya Jenil: balance increased from 37,482.50 to 38,482.50 (+1000) -> Credit!
    expect(result.rows[6].credit).toBe(100000)
    expect(result.rows[6].debit).toBe(0)
  })

  it("should handle password-protected PDF exception gracefully", async () => {
    mockGetDocumentProxy.mockRejectedValue({
      name: "PasswordException",
      message: "Password required",
    })

    const fakePdfBuffer = Buffer.from("%PDF-1.7 protected pdf")
    const result = await parsePDF(fakePdfBuffer)

    expect(result.errors).toContain("PASSWORD_REQUIRED")
    expect(result.rows).toHaveLength(0)
  })
})
