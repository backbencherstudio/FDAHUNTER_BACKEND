import { FastifyRequest, FastifyReply } from "fastify";
import Stripe from "stripe";
import { getImageUrl } from "../../../utils/baseurl";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("Missing STRIPE_SECRET_KEY environment variable");
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2025-10-29.clover",
});

interface CheckoutRequestBody {
  subscriptionPackageId: string;
}

export const checkout = async (
  request: FastifyRequest<{ Body: CheckoutRequestBody }>,
  reply: FastifyReply
) => {
  try {
    const { subscriptionPackageId } = request.body;

    const userId = request.user?.id;
    const prisma = request.server.prisma;

    if (!userId) {
      return reply.status(401).send({
        success: false,
        message: "User not authenticated",
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) {
      return reply.status(404).send({
        success: false,
        message: "User not found",
      });
    }


    if (!subscriptionPackageId) {
      return reply.status(400).send({
        success: false,
        message: "Subscription package ID is required",
      });
    }

    const subscriptionPackage = await prisma.subscriptionPackage.findUnique({
      where: { id: subscriptionPackageId },
    });

    if (!subscriptionPackage) {
      return reply.status(404).send({
        success: false,
        message: "Subscription package not found",
      });
    }

    if (!subscriptionPackage.stripePriceId) {
      return reply.status(400).send({
        success: false,
        message: "Stripe priceId not configured for this package",
      });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price: subscriptionPackage.stripePriceId,
          quantity: 1,
        },
      ],
      mode: "subscription",

      success_url:
        `myflutterapp://payment-success?session`,
      cancel_url: "myflutterapp://payment-cancel",

      client_reference_id: userId,
      metadata: {
        userId: userId,
        subscriptionPackageId: subscriptionPackageId,
      },
    });

    // Create transaction record
    const transaction = await prisma.transaction.create({
      data: {
        userId: userId,
        subscriptionPackageId: subscriptionPackageId,
        amount: subscriptionPackage.amount,
        currency: subscriptionPackage.currency,
        stripeSessionId: session.id,
        status: "pending",
        autoRenewal: true,
      },
    });

    return reply.status(200).send({
      success: true,
      message: "Checkout session created successfully",
      data: {
        sessionId: session.id,
        url: session.url,
        transactionId: transaction.id,
      },
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({
      success: false,
      message: "Failed to create checkout session",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

/**
 * Cancel user's active subscription
 * Cancels the subscription in Stripe, webhook will handle database updates
 */
export const cancelSubscription = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const userId = request.user?.id;
    const prisma = request.server.prisma;

    if (!userId) {
      return reply.status(401).send({
        success: false,
        message: "User not authenticated",
      });
    }

    // Find user's account with subscription info
    const account = await prisma.account.findUnique({
      where: { userId },
      include: { user: true },
    });

    if (!account) {
      return reply.status(404).send({
        success: false,
        message: "Account not found",
      });
    }

    if (!account.stripeSubscriptionId) {
      return reply.status(400).send({
        success: false,
        message: "No active subscription found",
      });
    }

    // Cancel the subscription in Stripe immediately
    const canceledSubscription = await stripe.subscriptions.cancel(
      account.stripeSubscriptionId
    );

    request.log.info(`Subscription cancellation initiated for user ${userId}`);

    return reply.status(200).send({
      success: true,
      message: "Subscription cancellation initiated successfully",
      data: {
        subscriptionId: canceledSubscription.id,
        status: canceledSubscription.status,
        canceledAt: canceledSubscription.canceled_at
          ? new Date(canceledSubscription.canceled_at * 1000)
          : null,
      },
    });
  } catch (error) {
    request.log.error({ err: error }, "Error canceling subscription");

    const stripeError = error as any;
    if (stripeError?.type?.startsWith("Stripe") || stripeError?.code) {
      return reply.status(400).send({
        success: false,
        message: `Stripe error: ${stripeError.message || "Unknown Stripe error"}`,
      });
    }

    return reply.status(500).send({
      success: false,
      message: "Failed to cancel subscription",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

interface DashboardStatsQuery {
  year?: string;
}

/**
 * Get dashboard statistics
 * Returns total earnings, total users, total subscriptions, monthly earnings chart data, and recent users
 */
export const getDashboardStats = async (
  request: FastifyRequest<{ Querystring: DashboardStatsQuery }>,
  reply: FastifyReply
) => {
  try {
    const prisma = request.server.prisma;
    const year = request.query?.year ? parseInt(request.query.year) : new Date().getFullYear();

    // Validate year
    if (isNaN(year) || year < 2000 || year > 2100) {
      return reply.status(400).send({
        success: false,
        message: "Invalid year parameter",
      });
    }

    // 1. Total Earnings - sum of all completed transactions
    const totalEarningsResult = await prisma.transaction.aggregate({
      where: {
        status: "completed",
      },
      _sum: {
        amount: true,
      },
    });
    const totalEarnings = totalEarningsResult._sum.amount || 0;

    // 2. Total Users - count of all users
    const totalUsers = await prisma.user.count();

    // 3. Total Subscriptions - count of all users who have ever gotten a subscription
    // (users with at least one completed transaction)
    const totalSubscriptions = await prisma.transaction.groupBy({
      by: ["userId"],
      where: {
        status: "completed",
      },
    }).then((result) => result.length);

    // 4. Monthly Earnings Chart Data - grouped by month for the specified year
    const startDate = new Date(year, 0, 1); // January 1st of the year
    const endDate = new Date(year, 11, 31, 23, 59, 59, 999); // December 31st of the year

    // Get all completed transactions for the year
    const transactions = await prisma.transaction.findMany({
      where: {
        status: "completed",
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: {
        amount: true,
        createdAt: true,
      },
    });

    // Group by month and sum amounts
    const monthlyEarnings: { [key: number]: number } = {};
    
    // Initialize all months to 0
    for (let month = 0; month < 12; month++) {
      monthlyEarnings[month] = 0;
    }

    // Sum amounts by month
    transactions.forEach((transaction) => {
      const month = transaction.createdAt.getMonth();
      monthlyEarnings[month] = (monthlyEarnings[month] || 0) + transaction.amount;
    });

    // Format chart data with month names
    const monthNames = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
    ];

    const earningsChartData = monthNames.map((monthName, index) => ({
      month: monthName,
      earnings: monthlyEarnings[index] || 0,
    }));

    // 5. Recent 20 Users - last 20 users ordered by createdAt
    const recentUsers = await prisma.user.findMany({
      take: 20,
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        createdAt: true,
        avatar: true,
      },
    });

    // Format recent users with serial numbers
    const formattedRecentUsers = recentUsers.map((user, index) => ({
      sl: index + 1,
      id: user.id,
      name: user.name || "N/A",
      email: user.email,
      phoneNumber: user.phone || "N/A",
      createdAt: user.createdAt,
      avatar: user.avatar ? getImageUrl(user.avatar) : null,
    }));

    return reply.status(200).send({
      success: true,
      message: "Dashboard statistics retrieved successfully",
      data: {
        totalEarnings: parseFloat(totalEarnings.toFixed(2)),
        totalUsers,
        totalSubscriptions,
        earningsChart: {
          year,
          data: earningsChartData,
        },
        recentUsers: formattedRecentUsers,
      },
    });
  } catch (error) {
    request.log.error({ err: error }, "Error fetching dashboard statistics");
    return reply.status(500).send({
      success: false,
      message: "Failed to fetch dashboard statistics",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

