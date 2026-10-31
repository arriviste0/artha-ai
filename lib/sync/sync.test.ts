import { describe, it, expect } from "vitest"
import { isOtpMessage, buildGmailQuery, getAllBankEmailSenders } from "./config"
import { TRANSACTION_PATTERNS } from "./patterns"
import { parseTransactionAlert } from "./parser"

describe("Bank Alert Sync Tests", () => {
  describe("Config & Senders", () => {
    it("should include HDFC bank senders", () => {
      const senders = getAllBankEmailSenders()
      expect(senders).toContain("alerts@hdfcbank.net")
    })

    it("should build proper Gmail query with after date", () => {
      const date = new Date("2024-10-01T00:00:00Z")
      const query = buildGmailQuery(date, ["alerts@hdfcbank.net"])
      expect(query).toContain("from:alerts@hdfcbank.net")
      expect(query).toContain("after:2024/10/01")
    })
  })

  describe("OTP Protection (Security Rule)", () => {
    it("should detect and reject OTP messages", () => {
      const otp1 = "Your HDFC Bank NetBanking OTP is 492011. Do not share this OTP with anyone."
      const otp2 = "One Time Password for your transaction is 829104. Valid for 5 min."
      const otp3 = "Secret code for login verification is 123456"

      expect(isOtpMessage(otp1)).toBe(true)
      expect(isOtpMessage(otp2)).toBe(true)
      expect(isOtpMessage(otp3)).toBe(true)
    })

    it("should not flag normal transactions as OTP", () => {
      const txn = "Rs. 1,250.00 has been debited from account **1234 to VPA swiggy@icici on 15-OCT-24."
      expect(isOtpMessage(txn)).toBe(false)
    })

    it("parseTransactionAlert must return null for OTP messages", async () => {
      const otpMsg = "OTP for Txn on card ending 1234 is 987654. Valid for 10 min. Do not share."
      const result = await parseTransactionAlert(otpMsg, "sms_sync")
      expect(result).toBeNull()
    })
  })

  describe("Pattern Parsing", () => {
    it("should parse HDFC debit alert email with VPA", async () => {
      const text =
        "Dear Customer, Rs.1,250.00 has been debited from account **1234 to VPA swiggy@icici on 15-OCT-24. Your UPI transaction reference number is 428912345678."
      const res = await parseTransactionAlert(text, "email_sync")

      expect(res).not.toBeNull()
      expect(res?.amountPaise).toBe(125000)
      expect(res?.type).toBe("debit")
      expect(res?.accountNumberMasked).toBe("XX1234")
      expect(res?.referenceNumber).toBe("428912345678")
      expect(res?.merchant).toContain("swiggy@icici")
      expect(res?.category).toBe("Food & Dining")
    })

    it("should parse HDFC credit alert email", async () => {
      const text =
        "Dear Customer, Rs.50,000.00 has been credited to account **1234 on 01-OCT-24 by UPI ref no 427512345678."
      const res = await parseTransactionAlert(text, "email_sync")

      expect(res).not.toBeNull()
      expect(res?.amountPaise).toBe(5000000)
      expect(res?.type).toBe("credit")
      expect(res?.accountNumberMasked).toBe("XX1234")
      expect(res?.referenceNumber).toBe("427512345678")
    })

    it("should parse HDFC card spent alert", async () => {
      const text =
        "Alert: You've spent Rs. 450.00 on HDFC Bank Card ending 5678 at SWIGGY on 2024-10-14 19:30:15. Auth code: 123456."
      const res = await parseTransactionAlert(text, "email_sync")

      expect(res).not.toBeNull()
      expect(res?.amountPaise).toBe(45000)
      expect(res?.type).toBe("debit")
      expect(res?.merchant).toBe("SWIGGY")
      expect(res?.accountNumberMasked).toBe("XX5678")
      expect(res?.referenceNumber).toBe("123456")
      expect(res?.category).toBe("Food & Dining")
    })

    it("should parse HDFC UPI SMS", async () => {
      const sms = "Sent Rs.250.00 from HDFC Bank A/C *1234 to ZOMATO via UPI Ref 428901234567 on 15-10-24"
      const res = await parseTransactionAlert(sms, "sms_sync")

      expect(res).not.toBeNull()
      expect(res?.amountPaise).toBe(25000)
      expect(res?.type).toBe("debit")
      expect(res?.merchant).toBe("ZOMATO")
      expect(res?.accountNumberMasked).toBe("XX1234")
      expect(res?.referenceNumber).toBe("428901234567")
      expect(res?.category).toBe("Food & Dining")
    })

    it("should parse user's HDFC VPA email with merchant in parens", async () => {
      const email = `Dear Customer,

Greetings from HDFC Bank!

Rs.25.00 is debited from your account ending 6934 towards VPA ******3569@ybl (RAM MANU SINGH PAN SHOP) on 31-10-26.`

      const res = await parseTransactionAlert(email, "email_sync")

      expect(res).not.toBeNull()
      expect(res?.amountPaise).toBe(2500)
      expect(res?.type).toBe("debit")
      expect(res?.merchant).toBe("RAM MANU SINGH PAN SHOP")
      expect(res?.accountNumberMasked).toBe("XX6934")
      expect(res?.category).toBe("Food & Dining")
      expect(res?.bank).toBe("HDFC Bank")
    })

    it("should parse generic Indian bank alert (SBI / ICICI)", async () => {
      const iciciSms = "INR 350.00 debited from A/C **4321 on 25-10-24 to BLINKIT UPI Ref 429212345678"
      const res = await parseTransactionAlert(iciciSms, "sms_sync")

      expect(res).not.toBeNull()
      expect(res?.amountPaise).toBe(35000)
      expect(res?.type).toBe("debit")
      expect(res?.merchant).toBe("BLINKIT")
      expect(res?.category).toBe("Food & Dining")
    })
  })
})
