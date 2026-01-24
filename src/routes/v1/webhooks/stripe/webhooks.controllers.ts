import { FastifyReply, FastifyRequest } from "fastify";
import Stripe from "stripe";

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

if (!webhookSecret) {
  throw new Error("Missing STRIPE_WEBHOOK_SECRET environment variable");
}

if (!stripeSecretKey) {
  throw new Error("Missing STRIPE_SECRET_KEY environment variable");
}

const stripe = new Stripe(stripeSecretKey, {
  apiVersion: "2025-10-29.clover",
});

/**
 * Check if subscription status indicates an active subscription
 * Active statuses: active, trialing
 * Inactive statuses: canceled, unpaid, past_due, incomplete, incomplete_expired
 */
const isActiveSubscription = (status: string): boolean => {
  const activeStatuses = ["active", "trialing"];
  return activeStatuses.includes(status);
};

/**
 * Update user's isSubscriber status based on subscription status
 */
const updateUserSubscriptionStatus = async (
  userId: string,
  subscriptionStatus: string,
  prisma: any,
  logger: { info: (message: string) => void }
) => {
  const shouldBeSubscriber = isActiveSubscription(subscriptionStatus);

  await prisma.user.update({
    where: { id: userId },
    data: { isSubscriber: shouldBeSubscriber },
  });

  logger.info(
    `User ${userId} subscription status updated: isSubscriber=${shouldBeSubscriber} (subscription status: ${subscriptionStatus})`
  );
};

/**
 * Handle checkout.session.completed event
 * Creates or updates account with subscription info and sets user as subscriber
 */
const handleCheckoutSessionCompleted = async (
  session: Stripe.Checkout.Session,
  prisma: any,
  logger: { info: (message: string) => void }
) => {
  const userId = session.metadata?.userId || session.client_reference_id;

  if (!userId) {
    throw new Error("User ID not found in session metadata");
  }

  // Retrieve the subscription from Stripe
  const subscriptionId = session.subscription as string;
  if (!subscriptionId) {
    throw new Error("Subscription ID not found in session");
  }

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const customerId = subscription.customer as string;
  const priceId = subscription.items.data[0]?.price.id;
  const productId = subscription.items.data[0]?.price.product as string;
  const subscriptionStatus = subscription.status;

  // Update or create account record
  await prisma.account.upsert({
    where: { userId },
    update: {
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscriptionId,
      stripePriceId: priceId,
      stripeProductId: productId,
      updatedAt: new Date(),
    },
    create: {
      userId,
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscriptionId,
      stripePriceId: priceId,
      stripeProductId: productId,
    },
  });

  // Update user subscription status based on actual subscription status
  await updateUserSubscriptionStatus(userId, subscriptionStatus, prisma, logger);

  // Update transaction status
  if (session.id) {
    await prisma.transaction.updateMany({
      where: { stripeSessionId: session.id },
      data: { status: "completed" },
    });
  }

  logger.info(`Subscription created for user ${userId}`);
};

/**
 * Handle invoice.payment_succeeded event
 * Updates transaction status for auto-renewal payments
 */
const handleInvoicePaymentSucceeded = async (
  invoice: Stripe.Invoice,
  prisma: any,
  logger: { warn: (message: string) => void; info: (message: string) => void }
) => {
  const invoiceData = invoice as any;
  const subscriptionId =
    typeof invoiceData.subscription === "string"
      ? invoiceData.subscription
      : invoiceData.subscription?.id || null;
  if (!subscriptionId) {
    return; // Not a subscription invoice
  }

  // Find account by subscription ID
  const account = await prisma.account.findFirst({
    where: { stripeSubscriptionId: subscriptionId },
  });

  if (!account) {
    logger.warn(`Account not found for subscription ${subscriptionId}`);
    return;
  }

  // Create or update transaction record for renewal
  const paymentIntentId =
    typeof invoiceData.payment_intent === "string"
      ? invoiceData.payment_intent
      : invoiceData.payment_intent?.id || null;

  if (paymentIntentId) {
    const existingTransaction = await prisma.transaction.findFirst({
      where: { stripePaymentIntentId: paymentIntentId },
    });

    if (existingTransaction) {
      await prisma.transaction.update({
        where: { id: existingTransaction.id },
        data: {
          status: "completed",
          updatedAt: new Date(),
        },
      });
    } else {
      // Get subscription package from account or use a default
      // Note: You may want to store subscriptionPackageId in account model
      const latestTransaction = await prisma.transaction.findFirst({
        where: { userId: account.userId },
        orderBy: { createdAt: "desc" },
      });

      await prisma.transaction.create({
        data: {
          userId: account.userId,
          subscriptionPackageId: latestTransaction?.subscriptionPackageId || "",
          amount: (invoice.amount_paid || 0) / 100, // Convert from cents
          currency: invoice.currency || "usd",
          stripePaymentIntentId: paymentIntentId,
          status: "completed",
          autoRenewal: true,
        },
      });
    }
  }

  logger.info(`Invoice payment succeeded for subscription ${subscriptionId}`);
};

/**
 * Handle customer.subscription.updated event
 * Updates user subscription status based on current subscription status
 */
const handleSubscriptionUpdated = async (
  subscription: Stripe.Subscription,
  prisma: any,
  logger: { warn: (message: string) => void; info: (message: string) => void }
) => {
  const subscriptionId = subscription.id;
  const subscriptionStatus = subscription.status;

  // Find account by subscription ID
  const account = await prisma.account.findFirst({
    where: { stripeSubscriptionId: subscriptionId },
  });

  if (!account) {
    logger.warn(`Account not found for subscription ${subscriptionId}`);
    return;
  }

  // Update user subscription status based on actual subscription status
  await updateUserSubscriptionStatus(account.userId, subscriptionStatus, prisma, logger);

  // If subscription is canceled, deleted, or unpaid, clear subscription fields
  if (
    subscriptionStatus === "canceled" ||
    subscriptionStatus === "unpaid" ||
    subscriptionStatus === "incomplete_expired"
  ) {
    await prisma.account.update({
      where: { id: account.id },
      data: {
        stripeSubscriptionId: null,
        stripePriceId: null,
        stripeProductId: null,
        updatedAt: new Date(),
      },
    });

    // Update any pending transactions
    await prisma.transaction.updateMany({
      where: {
        userId: account.userId,
        status: "pending",
      },
      data: {
        status: "canceled",
        autoRenewal: false,
      },
    });

    logger.info(`Subscription ${subscriptionStatus} for user ${account.userId}`);
  }
};

/**
 * Handle customer.subscription.deleted event
 * Sets user as non-subscriber and clears subscription fields
 */
const handleSubscriptionDeleted = async (
  subscription: Stripe.Subscription,
  prisma: any,
  logger: { warn: (message: string) => void; info: (message: string) => void }
) => {
  const subscriptionId = subscription.id;

  // Find account by subscription ID
  const account = await prisma.account.findFirst({
    where: { stripeSubscriptionId: subscriptionId },
  });

  if (!account) {
    logger.warn(`Account not found for subscription ${subscriptionId}`);
    return;
  }

  // Set user as non-subscriber
  await prisma.user.update({
    where: { id: account.userId },
    data: { isSubscriber: false },
  });

  // Clear subscription-related fields in account
  await prisma.account.update({
    where: { id: account.id },
    data: {
      stripeSubscriptionId: null,
      stripePriceId: null,
      stripeProductId: null,
      updatedAt: new Date(),
    },
  });

  // Update any pending transactions
  await prisma.transaction.updateMany({
    where: {
      userId: account.userId,
      status: "pending",
    },
    data: {
      status: "canceled",
      autoRenewal: false,
    },
  });

  logger.info(`Subscription deleted for user ${account.userId}`);
};

export const manageWebhook = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const signatureHeader = request.headers["stripe-signature"];

    if (!signatureHeader) {
      return reply.status(400).send({
        success: false,
        message: "Missing Stripe signature header",
      });
    }

    // Get the raw body
    const rawBody = request.rawBody;

    // If rawBody is not available, you need to configure Fastify to keep it
    if (!rawBody) {
      return reply.status(400).send({
        success: false,
        message: "Missing raw body - configure Fastify to preserve raw body",
      });
    }

    const event = stripe.webhooks.constructEvent(
      rawBody as string | Buffer,
      signatureHeader,
      webhookSecret
    );

    const prisma = request.server.prisma;

    request.log.info({
      eventType: event.type,
      eventId: event.id,
    });

    // Handle the event
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutSessionCompleted(session, prisma, request.log);
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        await handleInvoicePaymentSucceeded(invoice, prisma, request.log);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionDeleted(subscription, prisma, request.log);
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        // Always update subscription status to ensure isSubscriber is correct
        await handleSubscriptionUpdated(subscription, prisma, request.log);
        break;
      }

      default:
        request.log.info(`Unhandled event type: ${event.type}`);
    }

    return reply.send({
      success: true,
      received: true,
      eventType: event.type,
    });
  } catch (error) {
    request.log.error({ err: error }, "Error processing Stripe webhook");
    return reply.status(400).send({
      success: false,
      message: "Webhook Error: " + (error instanceof Error ? error.message : "Unknown error"),
    });
  }
};