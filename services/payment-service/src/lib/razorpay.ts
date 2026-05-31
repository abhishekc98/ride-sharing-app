import Razorpay from 'razorpay'

let rp: Razorpay | null = null

export function getRazorpay(): Razorpay {
  if (!rp) {
    rp = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID!,
      key_secret: process.env.RAZORPAY_KEY_SECRET!,
    })
  }
  return rp
}

export async function createOrder(amount: number, receiptId: string) {
  return getRazorpay().orders.create({
    amount: Math.round(amount * 100), // paise
    currency: 'INR',
    receipt: receiptId,
  })
}

export async function issueRefund(paymentId: string, amount: number) {
  return getRazorpay().payments.refund(paymentId, { amount: Math.round(amount * 100) })
}
