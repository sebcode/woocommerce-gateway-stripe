<?php
/**
 * Class WC_Stripe_Subscriptions_Repairer_Legacy_SEPA_Tokens
 */

defined( 'ABSPATH' ) || exit;

/**
 * Handles migrating the tokens of Subscriptions using SEPA's Legacy gateway ID.
 *
 * This class extends the WCS_Background_Repairer for scheduling and running the individual migration actions.
 */
class WC_Stripe_Subscriptions_Repairer_Legacy_SEPA_Tokens extends WCS_Background_Repairer {

	/**
	 * Constructor
	 *
	 * @param WC_Logger_Interface $logger The WC_Logger instance.
	 */
	public function __construct( WC_Logger_Interface $logger ) {
		$this->logger = $logger;

		$this->scheduled_hook = 'wc_stripe_schedule_subscriptions_legacy_sepa_token_repairs';
		$this->repair_hook    = 'wc_stripe_subscriptions_legacy_sepa_token_repair';
		$this->log_handle     = 'woocommerce-gateway-stripe-subscriptions-legacy-sepa-tokens-repairs';
	}

	/**
	 * Conditionally schedules the repair of subscriptions using the Legacy SEPA payment method.
	 *
	 * Don't run if either of these conditions are met:
	 *    - The WooCommerce Subscriptions extension isn't active.
	 *    - The Legacy checkout experience is enabled (aka UPE is disabled).
	 */
	public function maybe_update() {
		if (
			! class_exists( 'WC_Subscriptions' ) ||
			! WC_Stripe_Feature_Flags::is_upe_checkout_enabled() ||
			'yes' === get_option( 'woocommerce_stripe_subscriptions_legacy_sepa_tokens_updated' )
		) {
			return;
		}

		// Schedule the repair without checking if there are subscriptions to be migrated.
		// This will be handled in the scheduled action.
		$this->schedule_repair();

		// Prevent the repair from being scheduled again.
		update_option( 'woocommerce_stripe_subscriptions_legacy_sepa_tokens_updated', 'yes' );
	}

	/**
	 * Triggers the conditional payment method update for the given subscription.
	 *
	 * This is the callback for the repair hook.
	 *
	 * @param int $subscription_id ID of the subscription to be processed.
	 */
	public function repair_item( $subscription_id ) {
		try {
			$this->log( sprintf( 'Migrating subscription #%1$d.', $subscription_id ) );

			$token_updater = new WC_Stripe_Subscriptions_Legacy_SEPA_Token_Update();
			$token_updater->maybe_update_subscription_legacy_payment_method( $subscription_id );

			$this->log( sprintf( 'Successful migration of subscription #%1$d.', $subscription_id ) );
		} catch ( \Exception $e ) {
			$this->log( $e->getMessage() );
		}
	}

	/**
	 * Gets the batch of subscriptions using the Legacy SEPA payment method to be updated.
	 *
	 * @param int $page The page of results to fetch.
	 *
	 * @return int[] The IDs of the subscriptions to migrate.
	 */
	protected function get_items_to_repair( $page ) {
		$items_to_repair = wc_get_orders(
			[
				'return'         => 'ids',
				'type'           => 'shop_subscription',
				'posts_per_page' => 20,
				'paged'          => $page,
				'status'         => 'any',
				'paged'          => $page,
				'payment_method' => WC_Gateway_Stripe_Sepa::ID,
				'order'          => 'ASC',
				'orderby'        => 'ID',
			]
		);

		if ( empty( $items_to_repair ) ) {
			$this->log( 'Finished scheduling subscription migrations.' );
		}

		return $items_to_repair;
	}
}
