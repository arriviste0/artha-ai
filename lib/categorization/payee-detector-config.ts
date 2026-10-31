/**
 * Configuration for Payee Identity and Business-vs-Person Detection.
 * Keep all VPA patterns, keywords, and heuristics here so they can be easily updated.
 */

export interface PayeeDetectorConfig {
  businessVpaPatterns: RegExp[]
  businessNameWords: string[]
  personVpaPatterns: RegExp[]
}

export const PAYEE_DETECTOR_CONFIG: PayeeDetectorConfig = {
  // Business VPA patterns:
  // - Starts with paytmqr (e.g. paytmqr2810050501011@paytm)
  // - Matches q\d+@ybl (e.g. q12345678@ybl)
  // - Contains bharatpe (e.g. bharatpe.90123@fbpe)
  // - Contains okbizaxis (Google Pay for Business)
  // - Contains @ptys, @ptyes (Paytm merchant handles)
  // - Long alphanumeric IDs / merchant prefixes rather than human names
  businessVpaPatterns: [
    /^paytmqr[a-z0-9_-]*@/i,
    /^q\d+@ybl$/i,
    /bharatpe/i,
    /okbizaxis/i,
    /@ptys\b/i,
    /@ptyes\b/i,
    /^mab\.[a-z0-9_.-]+@/i,
    /merchant/i,
    /billdesk/i,
    /razorpay/i,
    /cashfree/i,
    /swiggy/i,
    /zomato/i,
  ],

  // Words that indicate a commercial enterprise or retail establishment
  businessNameWords: [
    "stores",
    "store",
    "mart",
    "kirana",
    "provision",
    "traders",
    "enterprises",
    "enterprise",
    "agencies",
    "medical",
    "pharmacy",
    "hotel",
    "restaurant",
    "bakery",
    "sweets",
    "tiffin",
    "dhaba",
    "garage",
    "motors",
    "electricals",
    "hardware",
    "salon",
    "studio",
    "services",
    "solutions",
    "pvt",
    "ltd",
    "llp",
    "& sons",
    "brothers",
    "bros",
    "jewellers",
    "jewelers",
    "stationery",
    "cafe",
    "canteen",
    "clinic",
    "hospital",
    "diagnostics",
    "supermarket",
    "petrol",
    "fuel",
    "optics",
    "optical",
    "opticals",
    "optician",
    "eyewear",
    "eye care",
  ],

  // Person VPA patterns:
  // - 10-digit mobile number before @ (e.g. 9876543210@ybl, 9876543210@paytm)
  // - firstname.lastname style (e.g. rahul.sharma@okaxis, john_doe@okhdfcbank)
  personVpaPatterns: [
    /^[6-9]\d{9}@[a-z0-9.-]+$/i,
    /^[a-z]{3,}\.[a-z]{3,}@[a-z0-9.-]+$/i,
    /^[a-z]{3,}_[a-z]{3,}@[a-z0-9.-]+$/i,
  ],
}
