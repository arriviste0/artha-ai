import { describe, it, expect } from "vitest"
import { isOtpMessage, buildGmailQuery, getAllBankEmailSenders } from "./config"
import { TRANSACTION_PATTERNS, extractReferenceNumber } from "./patterns"
import { parseTransactionAlert } from "./parser"
import { deduplicateTransactions } from "./dedupe"
import { cleanHtmlToText } from "./gmail"

describe("Bank Alert Sync Tests", () => {
  describe("Config & Senders", () => {
    it("should include HDFC bank senders", () => {
      const senders = getAllBankEmailSenders()
      expect(senders).toContain("alerts@hdfcbank.net")
    })

    it("should build proper Gmail query with after date including 2-day safety buffer", () => {
      const date = new Date("2024-10-05T00:00:00Z")
      const query = buildGmailQuery(date, ["alerts@hdfcbank.net"])
      expect(query).toContain("from:alerts@hdfcbank.net")
      expect(query).toContain("after:2024/10/03")
      expect(query).toContain("(from:alerts@hdfcbank.net) (")
      expect(query).not.toContain("from:alerts@hdfcbank.net OR")
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
    it("should parse user's 10000 alert towards PATEL VED RITESHKUMAR", async () => {
      const text = "Rs.10000.00 is debited from your account ending 6934 towards VPA ******3272@pthdfc (PATEL VED RITESHKUMAR) on 31-10-26. UPI transaction reference no.: 132122110"
      const res = await parseTransactionAlert(text, "email_sync")

      expect(res).not.toBeNull()
      expect(res?.amountPaise).toBe(1000000)
      expect(res?.merchant).toBe("PATEL VED RITESHKUMAR")
      expect(res?.referenceNumber).toBe("132122110")
    })

    it("should parse user's 2000 alert towards KOHINOOR OPTICS with reference 13212 and Healthcare category", async () => {
      const emailDate = new Date("2026-10-31T07:09:00.000Z")
      const text = `HDFC Bank InstaAlerts
31 Oct 2026, 12:39 (16 hours ago)
Rs.2000.00 is debited from your account ending 6934 towards VPA ***************3876@hdfcbank (KOHINOOR OPTICS) on 31-10-26. UPI transaction reference no.: 13212`
      const res = await parseTransactionAlert(text, "email_sync", emailDate)

      expect(res).not.toBeNull()
      expect(res?.amountPaise).toBe(200000)
      expect(res?.merchant).toBe("KOHINOOR OPTICS")
      expect(res?.referenceNumber).toBe("13212")
      expect(res?.category).toBe("Healthcare")
      // Should preserve the 07:09:00 time from emailDate instead of midnight
      expect(res?.occurredAt.getUTCHours()).toBe(7)
      expect(res?.occurredAt.getUTCMinutes()).toBe(9)
    })

    it("should parse VPA containing dots accurately", async () => {
      const text =
        "Rs.1500.00 is debited from your account ending 6934 towards VPA pranshu.patel@okhdfcbank (PRANSHU PATEL) on 31-10-26. UPI transaction reference no.: 987654321"
      const res = await parseTransactionAlert(text, "email_sync")

      expect(res).not.toBeNull()
      expect(res?.amountPaise).toBe(150000)
      expect(res?.merchant).toBe("PRANSHU PATEL")
      expect(res?.referenceNumber).toBe("987654321")
    })

    it("should NOT drop two identical amount transactions to same person if they have different reference numbers", async () => {
      const tx1 = await parseTransactionAlert(
        "Rs.2000.00 is debited from your account ending 6934 towards VPA ******3876@hdfcbank (KOHINOOR OPTICS) on 31-10-26. UPI transaction reference no.: 13212",
        "email_sync"
      )
      const tx2 = await parseTransactionAlert(
        "Rs.2000.00 is debited from your account ending 6934 towards VPA ******3876@hdfcbank (KOHINOOR OPTICS) on 31-10-26. UPI transaction reference no.: 13213",
        "email_sync"
      )

      expect(tx1).not.toBeNull()
      expect(tx2).not.toBeNull()

      const { newTransactions, duplicateCount } = await deduplicateTransactions("test_user_repeat", [tx1!, tx2!])
      expect(newTransactions).toHaveLength(2)
      expect(duplicateCount).toBe(0)
    })

    it("cleanHtmlToText should strip style, script, comments and HTML entities", () => {
      const html = `<html>
        <head>
          <style type="text/css">
            <!-- HDFC BANK --> @media screen { body { color: red; } }
          </style>
        </head>
        <body>
          <script>console.log('secret');</script>
          <p>Dear Customer, Rs.10000.00 is debited from account ending 6934 &amp; &nbsp; towards VPA user@upi.</p>
        </body>
      </html>`

      const text = cleanHtmlToText(html)
      expect(text).not.toContain("HDFC BANK")
      expect(text).not.toContain("console.log")
      expect(text).not.toContain("@media")
      expect(text).toContain("Rs.10000.00 is debited from account ending 6934 & towards VPA user@upi.")
    })

    it("extractReferenceNumber should never extract bank name or blacklisted tokens", () => {
      // Even if "HDFC" or "Bank" appears right after the reference label, skip it and extract the real number
      const text1 = "UPI transaction reference no.: HDFC Bank 132122110737 on 31-10-26"
      expect(extractReferenceNumber(text1)).toBe("132122110737")

      const text2 = "Your UPI transaction reference number is 428912345678."
      expect(extractReferenceNumber(text2)).toBe("428912345678")

      const text3 = "Alert: txn id: 987654321 is completed"
      expect(extractReferenceNumber(text3)).toBe("987654321")
    })

    it("should correctly sync real HDFC email text without reference number collision", async () => {
      const rawHtml = `<style type="text/css"><!-- HDFC BANK --> body { color: #000; }</style>
        <p>Dear Customer,</p>
        <p>Greetings from HDFC Bank!</p>
        <p>Rs.10000.00 is debited from your account ending 6934 towards VPA ******3272@pthdfc (PATEL VED RITESHKUMAR) on 31-10-26. UPI transaction reference no.: 132122110737.</p>`

      const cleanText = cleanHtmlToText(rawHtml)
      const res = await parseTransactionAlert(cleanText, "email_sync")

      expect(res).not.toBeNull()
      expect(res?.amountPaise).toBe(1000000)
      expect(res?.merchant).toBe("PATEL VED RITESHKUMAR")
      expect(res?.referenceNumber).toBe("132122110737")
      expect(res?.referenceNumber).not.toBe("HDFC")
    })

    it("should parse HDFC Credit Card debit alert (MakeMyTrip 8521.00)", async () => {
      const text =
        "Dear Customer, Greetings from HDFC Bank. We would like to inform you that Rs. 8521.00 has been debited from your HDFC Bank Credit Card ending 8377 towards MAKEMYTRIP INDIA PVT L on 25 Oct, 2026 at 00:12:40. To check your available balance"
      const res = await parseTransactionAlert(text, "email_sync")

      expect(res).not.toBeNull()
      expect(res?.amountPaise).toBe(852100)
      expect(res?.type).toBe("debit")
      expect(res?.accountNumberMasked).toBe("XX8377")
      expect(res?.merchant).toBe("MAKEMYTRIP INDIA PVT L")
      expect(res?.category).toBe("Transport")
      expect(res?.bank).toBe("HDFC Bank")
    })

    it("should parse HDFC Credit Card debit alert (Circle Store 4192.00)", async () => {
      const text =
        "Dear Customer, Greetings from HDFC Bank. We would like to inform you that Rs. 4192.00 has been debited from your HDFC Bank Credit Card ending 8377 towards RAZ*Circle Store on 24 Oct, 2026 at 14:51:24."
      const res = await parseTransactionAlert(text, "email_sync")

      expect(res).not.toBeNull()
      expect(res?.amountPaise).toBe(419200)
      expect(res?.type).toBe("debit")
      expect(res?.accountNumberMasked).toBe("XX8377")
      expect(res?.merchant).toBe("RAZ*Circle Store")
      expect(res?.bank).toBe("HDFC Bank")
    })

    it("should parse HDFC Deposit Alert (NEFT 53,661.00)", async () => {
      const text =
        "Dear Customer, You have received a credit in your HDFC Bank account. Details of the transaction: Amount received: INR 53,661.00 Account: XX6934 Date: 30-OCT-2026 Reference Details: NEFT Cr-DEUT0784BBY-SIEMENS HEALTHINEERS INDIA LLP-Pranshu Patel-DEUTH00630304527 Available Balance: INR 62,263.35"
      const res = await parseTransactionAlert(text, "email_sync")

      expect(res).not.toBeNull()
      expect(res?.amountPaise).toBe(5366100)
      expect(res?.type).toBe("credit")
      expect(res?.accountNumberMasked).toBe("XX6934")
      expect(res?.merchant).toBe("SIEMENS HEALTHINEERS INDIA LLP")
      expect(res?.referenceNumber).toBe("DEUTH00630304527")
      expect(res?.bank).toBe("HDFC Bank")
    })

    it("should parse HDFC Account Update credit alert (1000.00)", async () => {
      const text =
        "Dear Customer, Greetings from HDFC Bank! We're writing to inform you that Rs.1000.00 has been successfully credited to your HDFC Bank account ending in 6934. Transaction Details: a. Date: 31-10-26 b. Sender: MANTRA PRAKASHBHAI PATEL (VPA: ******p425@okhdfcbank) c. UPI Reference No.: 132145644339"
      const res = await parseTransactionAlert(text, "email_sync")

      expect(res).not.toBeNull()
      expect(res?.amountPaise).toBe(100000)
      expect(res?.type).toBe("credit")
      expect(res?.accountNumberMasked).toBe("XX6934")
      expect(res?.merchant).toBe("MANTRA PRAKASHBHAI PATEL")
      expect(res?.referenceNumber).toBe("132145644339")
      expect(res?.bank).toBe("HDFC Bank")
    })

    it("should parse Credit Card Bill Payment received alert (12,082.41)", async () => {
      const text =
        "Payment of Rs. 12,082.41 received towards your HDFC Bank Credit Card ending 8377 on 30-10-2026. Ref no 1793307216810088."
      const res = await parseTransactionAlert(text, "email_sync")

      expect(res).not.toBeNull()
      expect(res?.amountPaise).toBe(1208241)
      expect(res?.type).toBe("credit")
      expect(res?.accountNumberMasked).toBe("XX8377")
      expect(res?.referenceNumber).toBe("1793307216810088")
    })

    it("should parse Account BillPay debit alert (12,082.41)", async () => {
      const text =
        "Rs. 12,082.41 is debited from your account ending 6934 towards IB BILLPAY DR-HDFC8E-463202XXXXXX8377 on 30-10-26. Ref: 1793307216810088."
      const res = await parseTransactionAlert(text, "email_sync")

      expect(res).not.toBeNull()
      expect(res?.amountPaise).toBe(1208241)
      expect(res?.type).toBe("debit")
      expect(res?.accountNumberMasked).toBe("XX6934")
      expect(res?.referenceNumber).toBe("1793307216810088")
    })
  })
})
