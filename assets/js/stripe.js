/* global wc_stripe_params */

jQuery( function( $ ) {
	'use strict';

	try {
		var stripe = Stripe( wc_stripe_params.key );
	} catch( error ) {
		console.log( error );
		return;
	}

	var stripe_elements_options = Object.keys( wc_stripe_params.elements_options ).length ? wc_stripe_params.elements_options : {},
		sepa_elements_options   = Object.keys( wc_stripe_params.sepa_elements_options ).length ? wc_stripe_params.sepa_elements_options : {},
		elements                = stripe.elements( stripe_elements_options ),
		iban                    = elements.create( 'iban', sepa_elements_options ),
		stripe_card,
		stripe_exp,
		stripe_cvc;

	/**
	 * Object to handle Stripe elements payment form.
	 */
	var wc_stripe_form = {
		paymentIntent: null,

		/**
		 * Unmounts all Stripe elements when the checkout page is being updated.
		 */
		unmountElements: function() {
			if ( 'yes' === wc_stripe_params.inline_cc_form ) {
				stripe_card.unmount( '#stripe-card-element' );
			} else {
				stripe_card.unmount( '#stripe-card-element' );
				stripe_exp.unmount( '#stripe-exp-element' );
				stripe_cvc.unmount( '#stripe-cvc-element' );
			}
		},

		/**
		 * Mounts all elements to their DOM nodes on initial loads and updates.
		 */
		mountElements: function() {
			if ( ! $( '#stripe-card-element' ).length ) {
				return;
			}

			if ( 'yes' === wc_stripe_params.inline_cc_form ) {
				return stripe_card.mount( '#stripe-card-element' );
			}

			stripe_card.mount( '#stripe-card-element' );
			stripe_exp.mount( '#stripe-exp-element' );
			stripe_cvc.mount( '#stripe-cvc-element' );
		},

		/**
		 * Creates all Stripe elements that will be used to enter cards or IBANs.
		 */
		createElements: function() {
			var elementStyles = {
				base: {
					iconColor: '#666EE8',
					color: '#31325F',
					fontSize: '15px',
					'::placeholder': {
				  		color: '#CFD7E0',
					}
				}
			};

			var elementClasses = {
				focus: 'focused',
				empty: 'empty',
				invalid: 'invalid',
			};

			elementStyles  = wc_stripe_params.elements_styling ? wc_stripe_params.elements_styling : elementStyles;
			elementClasses = wc_stripe_params.elements_classes ? wc_stripe_params.elements_classes : elementClasses;

			if ( 'yes' === wc_stripe_params.inline_cc_form ) {
				stripe_card = elements.create( 'card', { style: elementStyles, hidePostalCode: true } );

				stripe_card.addEventListener( 'change', function( event ) {
					wc_stripe_form.onCCFormChange();

					if ( event.error ) {
						$( document.body ).trigger( 'stripeError', event );
					}
				} );
			} else {
				stripe_card = elements.create( 'cardNumber', { style: elementStyles, classes: elementClasses } );
				stripe_exp  = elements.create( 'cardExpiry', { style: elementStyles, classes: elementClasses } );
				stripe_cvc  = elements.create( 'cardCvc', { style: elementStyles, classes: elementClasses } );

				stripe_card.addEventListener( 'change', function( event ) {
					wc_stripe_form.onCCFormChange();

					wc_stripe_form.updateCardBrand( event.brand );

					if ( event.error ) {
						$( document.body ).trigger( 'stripeError', event );
					}
				} );

				stripe_exp.addEventListener( 'change', function( event ) {
					wc_stripe_form.onCCFormChange();

					if ( event.error ) {
						$( document.body ).trigger( 'stripeError', event );
					}
				} );

				stripe_cvc.addEventListener( 'change', function( event ) {
					wc_stripe_form.onCCFormChange();

					if ( event.error ) {
						$( document.body ).trigger( 'stripeError', event );
					}
				} );
			}

			/**
			 * Only in checkout page we need to delay the mounting of the
			 * card as some AJAX process needs to happen before we do.
			 */
			if ( 'yes' === wc_stripe_params.is_checkout ) {
				$( document.body ).on( 'updated_checkout', function() {
					// Don't mount elements a second time.
					if ( stripe_card ) {
						wc_stripe_form.unmountElements();
					}

					wc_stripe_form.mountElements();

					if ( $( '#stripe-iban-element' ).length ) {
						iban.mount( '#stripe-iban-element' );
					}
				} );
			} else if ( $( 'form#add_payment_method' ).length || $( 'form#order_review' ).length ) {
				wc_stripe_form.mountElements();

				if ( $( '#stripe-iban-element' ).length ) {
					iban.mount( '#stripe-iban-element' );
				}
			}
		},

		/**
		 * Updates the card brand logo with non-inline CC forms.
		 *
		 * @param {string} brand The identifier of the chosen brand.
		 */
		updateCardBrand: function( brand ) {
			var brandClass = {
				'visa': 'stripe-visa-brand',
				'mastercard': 'stripe-mastercard-brand',
				'amex': 'stripe-amex-brand',
				'discover': 'stripe-discover-brand',
				'diners': 'stripe-diners-brand',
				'jcb': 'stripe-jcb-brand',
				'unknown': 'stripe-credit-card-brand'
			};

			var imageElement = $( '.stripe-card-brand' ),
				imageClass = 'stripe-credit-card-brand';

			if ( brand in brandClass ) {
				imageClass = brandClass[ brand ];
			}

			// Remove existing card brand class.
			$.each( brandClass, function( index, el ) {
				imageElement.removeClass( el );
			} );

			imageElement.addClass( imageClass );
		},

		/**
		 * Initialize event handlers and UI state.
		 */
		init: function() {
			// Initialize tokenization script if on change payment method page and pay for order page.
			if ( 'yes' === wc_stripe_params.is_change_payment_page || 'yes' === wc_stripe_params.is_pay_for_order_page ) {
				$( document.body ).trigger( 'wc-credit-card-form-init' );
			}

			// Stripe Checkout.
			this.stripe_checkout_submit = false;

			// checkout page
			if ( $( 'form.woocommerce-checkout' ).length ) {
				this.form = $( 'form.woocommerce-checkout' );
			}

			// ToDo: Combine those listeners and conditions in a meaningful way

			$( 'form.woocommerce-checkout' )
				.on(
					'checkout_place_order_stripe checkout_place_order_stripe_bancontact checkout_place_order_stripe_sofort checkout_place_order_stripe_giropay checkout_place_order_stripe_ideal checkout_place_order_stripe_alipay checkout_place_order_stripe_sepa',
					this.onSubmit
				);

			// pay order page
			if ( $( 'form#order_review' ).length ) {
				this.form = $( 'form#order_review' );
			}

			$( 'form#order_review, form#add_payment_method' )
				.on(
					'submit',
					this.onSubmit
				);

			// add payment method page
			if ( $( 'form#add_payment_method' ).length ) {
				this.form = $( 'form#add_payment_method' );
			}

			$( 'form.woocommerce-checkout' )
				.on(
					'change',
					this.reset
				);

			$( document )
				.on(
					'stripeError',
					this.onError
				)
				.on(
					'checkout_error',
					this.reset
				);

			// SEPA IBAN.
			iban.on( 'change',
				this.onSepaError
			);

			wc_stripe_form.createElements();

			if ( 'yes' === wc_stripe_params.is_stripe_checkout ) {
				$( document.body ).on( 'click', '.wc-stripe-checkout-button', function() {
					wc_stripe_form.block();
					wc_stripe_form.openModal();
					return false;
				} );
			}
		},

		/**
		 * Check to see if Stripe in general is being used for checkout.
		 *
		 * @return {boolean}
		 */
		isStripeChosen: function() {
			return $( '#payment_method_stripe, #payment_method_stripe_bancontact, #payment_method_stripe_sofort, #payment_method_stripe_giropay, #payment_method_stripe_ideal, #payment_method_stripe_alipay, #payment_method_stripe_sepa, #payment_method_stripe_eps, #payment_method_stripe_multibanco' ).is( ':checked' ) || ( $( '#payment_method_stripe' ).is( ':checked' ) && 'new' === $( 'input[name="wc-stripe-payment-token"]:checked' ).val() ) || ( $( '#payment_method_stripe_sepa' ).is( ':checked' ) && 'new' === $( 'input[name="wc-stripe-payment-token"]:checked' ).val() );
		},

		/**
		 * Currently only support saved cards via credit cards and SEPA. No other payment method.
		 *
		 * @return {boolean}
		 */
		isStripeSaveCardChosen: function() {
			return (
				$( '#payment_method_stripe' ).is( ':checked' )
				&& $( 'input[name="wc-stripe-payment-token"]' ).is( ':checked' )
				&& 'new' !== $( 'input[name="wc-stripe-payment-token"]:checked' ).val()
			) || (
				$( '#payment_method_stripe_sepa' ).is( ':checked' )
				&& $( 'input[name="wc-stripe_sepa-payment-token"]' ).is( ':checked' )
				&& 'new' !== $( 'input[name="wc-stripe_sepa-payment-token"]:checked' ).val()
			);
		},

		/**
		 * Check if Stripe credit card is being used used.
		 *
		 * @return {boolean}
		 */
		isStripeCardChosen: function() {
			return $( '#payment_method_stripe' ).is( ':checked' );
		},

		/**
		 * Check if Stripe Bancontact is being used used.
		 *
		 * @return {boolean}
		 */
		isBancontactChosen: function() {
			return $( '#payment_method_stripe_bancontact' ).is( ':checked' );
		},

		/**
		 * Check if Stripe Giropay is being used used.
		 *
		 * @return {boolean}
		 */
		isGiropayChosen: function() {
			return $( '#payment_method_stripe_giropay' ).is( ':checked' );
		},

		/**
		 * Check if Stripe iDeal is being used used.
		 *
		 * @return {boolean}
		 */
		isIdealChosen: function() {
			return $( '#payment_method_stripe_ideal' ).is( ':checked' );
		},

		/**
		 * Check if Stripe SOFORT is being used used.
		 *
		 * @return {boolean}
		 */
		isSofortChosen: function() {
			return $( '#payment_method_stripe_sofort' ).is( ':checked' );
		},

		/**
		 * Check if Stripe Alipay is being used used.
		 *
		 * @return {boolean}
		 */
		isAlipayChosen: function() {
			return $( '#payment_method_stripe_alipay' ).is( ':checked' );
		},

		/**
		 * Check if Stripe SEPA Direct Debit is being used used.
		 *
		 * @return {boolean}
		 */
		isSepaChosen: function() {
			return $( '#payment_method_stripe_sepa' ).is( ':checked' );
		},

		/**
		 * Check if Stripe P24 is being used used.
		 *
		 * @return {boolean}
		 */
		isP24Chosen: function() {
			return $( '#payment_method_stripe_p24' ).is( ':checked' );
		},

		/**
		 * Check if Stripe EPS is being used used.
		 *
		 * @return {boolean}
		 */
		isEpsChosen: function() {
			return $( '#payment_method_stripe_eps' ).is( ':checked' );
		},

		/**
		 * Check if Stripe Multibanco is being used used.
		 *
		 * @return {boolean}
		 */
		isMultibancoChosen: function() {
			return $( '#payment_method_stripe_multibanco' ).is( ':checked' );
		},

		/**
		 * Checks if a source ID is present as a hidden input.
		 * Only used when SEPA Direct Debit is chosen.
		 *
		 * @return {boolean}
		 */
		hasSource: function() {
			return 0 < $( 'input.stripe-source' ).length;
		},

		/**
		 * Checks whether a payment intent ID is present as a hidden input.
		 * Only used in combination with credit cards.
		 *
		 * @return {boolean}
		 */
		hasIntent: function() {
			return 0 < $( 'input.stripe-intent' ).length;
		},

		/**
		 * Check whether a mobile device is being used.
		 *
		 * @return {boolean}
		 */
		isMobile: function() {
			if( /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test( navigator.userAgent ) ) {
				return true;
			}

			return false;
		},

		/**
		 * Checks whether Stripe is chosen and Checkout is enabled to determine
		 * if the Stripe Checkout modal should be used instead of inline CC fields.
		 *
		 * @return {boolean}
		 */
		isStripeModalNeeded: function() {
			if ( 'yes' !== wc_stripe_params.is_stripe_checkout ) {
				return false;
			}

			// Don't affect submission if modal is not needed.
			if ( ! wc_stripe_form.isStripeChosen() ) {
				return false;
			}

			return true;
		},

		/**
		 * Blocks payment forms with an overlay while being submitted.
		 */
		block: function() {
			if ( ! wc_stripe_form.isMobile() ) {
				wc_stripe_form.form.block( {
					message: null,
					overlayCSS: {
						background: '#fff',
						opacity: 0.6
					}
				} );
			}
		},

		/**
		 * Removes overlays from payment forms.
		 */
		unblock: function() {
			wc_stripe_form.form.unblock();
		},

		/**
		 * Returns the selected payment method HTML element.
		 *
		 * @return {HTMLElement}
		 */
		getSelectedPaymentElement: function() {
			return $( '.payment_methods input[name="payment_method"]:checked' );
		},

		/**
		 * Opens the Stripe Checkout modal.
		 */
		openModal: function() {
			// Capture submittal and open stripecheckout
			var $form = wc_stripe_form.form,
				$data = $( '#stripe-payment-data' );

			wc_stripe_form.reset();

			var token_action = function( res ) {
				$form.find( 'input.stripe_source' ).remove();

				/* Since source was introduced in 4.0. We need to
				 * convert the token into a source.
				 */
				if ( 'token' === res.object ) {
					stripe.createSource( {
						type: 'card',
						token: res.id,
					} ).then( wc_stripe_form.sourceResponse );
				} else if ( 'source' === res.object ) {
					var response = { source: res };
					wc_stripe_form.sourceResponse( response );
				}
			};

			StripeCheckout.open( {
				key               : wc_stripe_params.key,
				billingAddress    : $data.data( 'billing-address' ),
				zipCode           : $data.data( 'verify-zip' ),
				amount            : $data.data( 'amount' ),
				name              : $data.data( 'name' ),
				description       : $data.data( 'description' ),
				currency          : $data.data( 'currency' ),
				image             : $data.data( 'image' ),
				locale            : $data.data( 'locale' ),
				email             : $( '#billing_email' ).val() || $data.data( 'email' ),
				panelLabel        : $data.data( 'panel-label' ),
				allowRememberMe   : $data.data( 'allow-remember-me' ),
				token             : token_action,
				closed            : wc_stripe_form.onClose,
			} );
		},

		/**
		 * Resets the Stripe Checkout modal.
		 */
		resetModal: function() {
			wc_stripe_form.reset();
			wc_stripe_form.stripe_checkout_submit = false;
		},

		/**
		 * Closes the Stripe Checkout modal.
		 */
		onClose: function() {
			wc_stripe_form.unblock();
		},

		/**
		 * Retrieves "owner" data from either the billing fields in a form or preset settings.
		 *
		 * @return {Object}
		 */
		getOwnerDetails: function() {
			var first_name = $( '#billing_first_name' ).length ? $( '#billing_first_name' ).val() : wc_stripe_params.billing_first_name,
				last_name  = $( '#billing_last_name' ).length ? $( '#billing_last_name' ).val() : wc_stripe_params.billing_last_name,
				owner      = { name: '', address: {}, email: '', phone: '' };

			owner.name = first_name;

			if ( first_name && last_name ) {
				owner.name = first_name + ' ' + last_name;
			} else {
				owner.name = $( '#stripe-payment-data' ).data( 'full-name' );
			}

			owner.email = $( '#billing_email' ).val();
			owner.phone = $( '#billing_phone' ).val();

			/* Stripe does not like empty string values so
			 * we need to remove the parameter if we're not
			 * passing any value.
			 */
			if ( typeof owner.phone === 'undefined' || 0 >= owner.phone.length ) {
				delete owner.phone;
			}

			if ( typeof owner.email === 'undefined' || 0 >= owner.email.length ) {
				if ( $( '#stripe-payment-data' ).data( 'email' ).length ) {
					owner.email = $( '#stripe-payment-data' ).data( 'email' );
				} else {
					delete owner.email;
				}
			}

			if ( typeof owner.name === 'undefined' || 0 >= owner.name.length ) {
				delete owner.name;
			}

			if ( $( '#billing_address_1' ).length > 0 ) {
				owner.address.line1       = $( '#billing_address_1' ).val();
				owner.address.line2       = $( '#billing_address_2' ).val();
				owner.address.state       = $( '#billing_state' ).val();
				owner.address.city        = $( '#billing_city' ).val();
				owner.address.postal_code = $( '#billing_postcode' ).val();
				owner.address.country     = $( '#billing_country' ).val();
			} else if ( wc_stripe_params.billing_address_1 ) {
				owner.address.line1       = wc_stripe_params.billing_address_1;
				owner.address.line2       = wc_stripe_params.billing_address_2;
				owner.address.state       = wc_stripe_params.billing_state;
				owner.address.city        = wc_stripe_params.billing_city;
				owner.address.postal_code = wc_stripe_params.billing_postcode;
				owner.address.country     = wc_stripe_params.billing_country;
			}

			return {
				owner: owner,
			};
		},

		/**
		 * Initiates the creation of a Source object.
		 *
		 * Currently this is only used for credit cards and SEPA Direct Debit,
		 * all other payment methods work with redirects to create sources.
		 */
		createSource: function() {
			var extra_details = wc_stripe_form.getOwnerDetails();

			// Handle SEPA Direct Debit payments.
			if ( wc_stripe_form.isSepaChosen() ) {
				extra_details.currency = $( '#stripe-sepa_debit-payment-data' ).data( 'currency' );
				extra_details.mandate  = { notification_method: wc_stripe_params.sepa_mandate_notification };
				extra_details.type     = 'sepa_debit';

				return stripe.createSource( iban, extra_details ).then( wc_stripe_form.sourceResponse );
			}

			// Handle card payments.
			var client_secret = $( '#stripe-payment-data' ).data( 'client-secret' );
			var data = {
				source_data: extra_details,
			};

			stripe.handleCardPayment( client_secret, stripe_card, data )
				.then( wc_stripe_form.paymentIntentResponse );
		},

		/**
		 * Handles responses, based on source object.
		 *
		 * After the switch to payment intents in 4.2.0 this method is only applicable to
		 * SEPA Direct Debit payments and the Stripe Checkout modal, as cards are handled by
		 * intents and all other payment methods require a redirect to an external portal.
		 *
		 * @param {Object} response The `stripe.createSource` response.
		 */
		sourceResponse: function( response ) {
			if ( response.error ) {
				return $( document.body ).trigger( 'stripeError', response );
			}

			wc_stripe_form.reset();

			wc_stripe_form.form.append(
				$( '<input type="hidden" />' )
					.addClass( 'stripe-source' )
					.attr( 'name', 'stripe_source' )
					.val( response.source.id )
			);

			if ( $( 'form#add_payment_method' ).length ) {
				$( wc_stripe_form.form ).off( 'submit', wc_stripe_form.form.onSubmit );
			}

			wc_stripe_form.form.submit();
		},

		/**
		 * Responds to payments with credit cards, which use PaymentIntents.
		 *
		 * @param {object} response The response from calling `stripe.handleCardPayment`.
		 */
		paymentIntentResponse: function( response ) {
			if ( response.error ) {
				return $( document.body ).trigger( 'stripeError', response );
			}

			wc_stripe_form.reset();

			wc_stripe_form.form.append(
				$( '<input type="hidden" />' )
					.addClass( 'stripe-intent' )
					.attr( 'name', 'stripe_intent' )
					.val( response.paymentIntent.id )
			);

			// ToDo: Check for `form#add_payment_method` and remove event listeners

			wc_stripe_form.form.submit();
		},

		/**
		 * Performs payment-related actions when a checkout/payment form is being submitted.
		 *
		 * @return {boolean} An indicator whether the submission should proceed.
		 *                   WooCommerce's checkout.js stops only on `false`, so this needs to be explicit.
		 */
		onSubmit: function() {
			if ( ! wc_stripe_form.isStripeChosen() ) {
				return true;
			}

			// If a source, or an intent is already in place, submit the form as usual.
			if ( wc_stripe_form.isStripeSaveCardChosen() || wc_stripe_form.hasSource() || wc_stripe_form.hasIntent() ) {
				return true;
			}

			// Open the Stripe Checkout modal.
			if ( wc_stripe_form.isStripeModalNeeded() && wc_stripe_form.isStripeCardChosen() ) {
				if ( 'yes' === wc_stripe_params.is_checkout ) {
					return true;
				} else {
					wc_stripe_form.block();
					wc_stripe_form.openModal();
					return false;
				}
			}

			// For methods that needs redirect, we will create the source server side so we can obtain the order ID.
			if (
				wc_stripe_form.isBancontactChosen() ||
				wc_stripe_form.isGiropayChosen() ||
				wc_stripe_form.isIdealChosen() ||
				wc_stripe_form.isAlipayChosen() ||
				wc_stripe_form.isSofortChosen() ||
				wc_stripe_form.isP24Chosen() ||
				wc_stripe_form.isEpsChosen() ||
				wc_stripe_form.isMultibancoChosen()
			) {
				return true;
			}

			wc_stripe_form.block();
			wc_stripe_form.createSource();

			return false;
		},

		/**
		 * If a new credit card is entered, reset sources, and intents.
		 */
		onCCFormChange: function() {
			wc_stripe_form.reset();
		},

		/**
		 * Removes all Stripe errors and hidden fields with IDs from the form.
		 */
		reset: function() {
			$( '.wc-stripe-error, .stripe-source, .stripe-intent' ).remove();
		},

		/**
		 * Displays a SEPA-specific error message.
		 *
		 * @param {Event} e The event with the error.
		 */
		onSepaError: function( e ) {
			var errorContainer = wc_stripe_form.getSelectedPaymentElement().parents( 'li' ).eq( 0 ).find( '.stripe-source-errors' );

			if ( ! e.error ) {
				return $( errorContainer ).html( '' );
			}

			console.log( e.error.message ); // Leave for troubleshooting.
			$( errorContainer ).html( '<ul class="woocommerce_error woocommerce-error wc-stripe-error"><li /></ul>' );
			$( errorContainer ).find( 'li' ).text( e.error.message ); // Prevent XSS
		},

		/**
		 * Displays stripe-related errors.
		 *
		 * @param {Event}  e      The jQuery event.
		 * @param {Object} result The result of Stripe call.
		 */
		onError: function( e, result ) {
			var message = result.error.message,
				errorContainer = wc_stripe_form.getSelectedPaymentElement().parents( 'li' ).eq(0).find( '.stripe-source-errors' );

			/*
			 * If payment method is SEPA and owner name is not completed,
			 * source cannot be created. So we need to show the normal
			 * Billing name is required error message on top of form instead
			 * of inline.
			 */
			if ( wc_stripe_form.isSepaChosen() ) {
				if ( 'invalid_owner_name' === result.error.code && wc_stripe_params.hasOwnProperty( result.error.code ) ) {
					var error = '<ul class="woocommerce-error"><li /></ul>';
					error.find( 'li' ).text( wc_stripe_params[ result.error.code ] ); // Prevent XSS

					return wc_stripe_form.submitError( error );
				}
			}

			/*
			 * Customers do not need to know the specifics of the below type of errors
			 * therefore return a generic localizable error message.
			 */
			if (
				'invalid_request_error' === result.error.type ||
				'api_connection_error'  === result.error.type ||
				'api_error'             === result.error.type ||
				'authentication_error'  === result.error.type ||
				'rate_limit_error'      === result.error.type
			) {
				message = wc_stripe_params.invalid_request_error;
			}

			if ( 'card_error' === result.error.type && wc_stripe_params.hasOwnProperty( result.error.code ) ) {
				message = wc_stripe_params[ result.error.code ];
			}

			if ( 'validation_error' === result.error.type && wc_stripe_params.hasOwnProperty( result.error.code ) ) {
				message = wc_stripe_params[ result.error.code ];
			}

			wc_stripe_form.reset();
			$( '.woocommerce-NoticeGroup-checkout' ).remove();
			console.log( result.error.message ); // Leave for troubleshooting.
			$( errorContainer ).html( '<ul class="woocommerce_error woocommerce-error wc-stripe-error"><li /></ul>' );
			$( errorContainer ).find( 'li' ).text( message ); // Prevent XSS

			if ( $( '.wc-stripe-error' ).length ) {
				$( 'html, body' ).animate({
					scrollTop: ( $( '.wc-stripe-error' ).offset().top - 200 )
				}, 200 );
			}
			wc_stripe_form.unblock();
		},

		/**
		 * Displays an error message in the beginning of the form and scrolls to it.
		 *
		 * @param {Object} error_message An error message jQuery object.
		 */
		submitError: function( error_message ) {
			$( '.woocommerce-NoticeGroup-checkout, .woocommerce-error, .woocommerce-message' ).remove();
			wc_stripe_form.form.prepend( '<div class="woocommerce-NoticeGroup woocommerce-NoticeGroup-checkout">' + error_message + '</div>' );
			wc_stripe_form.form.removeClass( 'processing' ).unblock();
			wc_stripe_form.form.find( '.input-text, select, input:checkbox' ).blur();

			var selector = '';

			if ( $( '#add_payment_method' ).length ) {
				selector = $( '#add_payment_method' );
			}

			if ( $( '#order_review' ).length ) {
				selector = $( '#order_review' );
			}

			if ( $( 'form.checkout' ).length ) {
				selector = $( 'form.checkout' );
			}

			if ( selector.length ) {
				$( 'html, body' ).animate({
					scrollTop: ( selector.offset().top - 100 )
				}, 500 );
			}

			$( document.body ).trigger( 'checkout_error' );
			wc_stripe_form.unblock();
		},

		/**
		 * Queries the server for a PaymentIntent.
		 *
		 * @return {Promise} A promise that resolves to a payment intent.
		 */
		getIntent: function() {
			return new Promise( function( resolve, reject ) {
				if ( wc_stripe_form.paymentIntent ) {
					return resolve( wc_stripe_form.paymentIntent );
				}

				$.ajax( {
					url: wc_stripe_form.getAjaxURL( 'create_intent' ),
					type: 'post',
					dataType: 'json',
					success: function( result ) {
						if ( result.error ) {
							reject( result.error );
						}

						wc_stripe_form.paymentIntent = result;
						resolve( result );
					},
					error: function() {
						reject( {
							code   : 'ajax_failed',
							message: wc_stripe_params.payment_intent_error,
						} );
					},
				} );
			} );
		},
	};

	wc_stripe_form.init();
} );
