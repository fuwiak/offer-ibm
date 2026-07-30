# ShopDB schema dump: purolat_com
Generated: 2026-07-30T04:17:24.865Z
Tables total: 241 (shop_*: 138)

## All tables
- accesslog_log (~0)
- blog_blog (~3)
- blog_category (~2)
- blog_comment (~13)
- blog_page (~0)
- blog_page_params (~0)
- blog_post (~56)
- blog_post_category (~0)
- blog_post_params (~0)
- contacts_history (~14)
- contacts_rights (~0)
- exchange_1c_categories (~233)
- exchange_1c_orders (~36355)
- exchange_1c_products (~17974)
- logs_published (~0)
- logs_tracked (~0)
- mailer_draft_recipients (~1140)
- mailer_form (~0)
- mailer_form_params (~0)
- mailer_form_subscribe_lists (~0)
- mailer_message (~25)
- mailer_message_log (~2)
- mailer_message_params (~52)
- mailer_message_recipients (~4)
- mailer_return_path (~0)
- mailer_sender (~1)
- mailer_sender_params (~1)
- mailer_subscribe_list (~0)
- mailer_subscriber (~0)
- mailer_subscriber_temp (~0)
- mailer_unsubscriber (~0)
- monitor_query_analyze (~0)
- monitor_query_log (~0)
- photos_album (~2)
- photos_album_count (~227)
- photos_album_params (~0)
- photos_album_photos (~15)
- photos_album_rights (~2)
- photos_page (~0)
- photos_page_params (~0)
- photos_photo (~23)
- photos_photo_exif (~119)
- photos_photo_rights (~15)
- photos_photo_tags (~0)
- photos_tag (~0)
- shop_abtest (~0)
- shop_abtest_variants (~0)
- shop_affiliate_transaction (~0)
- shop_api_courier (~0)
- shop_api_courier_storefronts (~0)
- shop_arrived (~601)
- shop_callb_request (~211)
- shop_cart_items (~110919)
- shop_category (~125)
- shop_category_og (~0)
- shop_category_params (~110)
- shop_category_products (~22293)
- shop_category_routes (~0)
- shop_catimg (~216)
- shop_checkout_flow (~308319)
- shop_contact_category_discount (~1)
- shop_coupon (~2)
- shop_currency (~4)
- shop_customer (~6009)
- shop_customers_filter (~5)
- shop_discount_by_sum (~0)
- shop_error301 (~24590)
- shop_events (~0)
- shop_expense (~0)
- shop_favgoods_items (~169)
- shop_feature (~8)
- shop_feature_values_color (~0)
- shop_feature_values_dimension (~7192)
- shop_feature_values_double (~0)
- shop_feature_values_range (~0)
- shop_feature_values_text (~0)
- shop_feature_values_varchar (~259)
- shop_filter (~4)
- shop_filter_rules (~6)
- shop_followup (~0)
- shop_followup_sources (~0)
- shop_group_srt (~2)
- shop_importexport (~4)
- shop_lastmodified_hash (~88557)
- shop_lastmodified_settings (~12)
- shop_linkcanonical_category_canonical (~0)
- shop_linkcanonical_product_canonical (~0)
- shop_notification (~7)
- shop_notification_params (~22)
- shop_notification_sources (~5)
- shop_oneclick_data (~18)
- shop_oneclick_profile (~1)
- shop_opt_prices (~34760)
- shop_order (~318832)
- shop_order_assign_rules (~0)
- shop_order_item_codes (~0)
- shop_order_items (~1141524)
- shop_order_log (~282806)
- shop_order_log_params (~1)
- shop_order_params (~5558843)
- shop_page (~2)
- shop_page_params (~4)
- shop_plugin (~4)
- shop_plugin_settings (~15)
- shop_presentation (~10)
- shop_presentation_columns (~89)
- shop_price (~2)
- shop_price_params (~2)
- shop_product (~18510)
- shop_product_code (~0)
- shop_product_features (~119747)
- shop_product_features_selectable (~0)
- shop_product_images (~15373)
- shop_product_og (~0)
- shop_product_pages (~0)
- shop_product_params (~4)
- shop_product_related (~0)
- shop_product_reviews (~0)
- shop_product_reviews_images (~0)
- shop_product_services (~0)
- shop_product_skus (~18513)
- shop_product_stocks (~0)
- shop_product_stocks_log (~1174383)
- shop_product_tags (~0)
- shop_promo (~4)
- shop_promo_orders (~0)
- shop_promo_routes (~8)
- shop_promo_rules (~4)
- shop_push_client (~0)
- shop_sales (~0)
- shop_sales_channel (~0)
- shop_sales_channel_params (~0)
- shop_saveredirect (~0)
- shop_search_index (~462765)
- shop_search_word (~9355)
- shop_seo_category_field (~1)
- shop_seo_category_field_value (~57)
- shop_seo_category_settings (~276)
- shop_seo_group_category (~0)
- shop_seo_group_category_category (~0)
- shop_seo_group_category_field_value (~0)
- shop_seo_group_category_settings (~0)
- shop_seo_group_category_storefront (~0)
- shop_seo_group_storefront (~0)
- shop_seo_group_storefront_storefront (~0)
- shop_seo_plugin_settings (~7)
- shop_seo_product_field (~0)
- shop_seo_product_field_value (~0)
- shop_seo_product_settings (~0)
- shop_seo_storefront_field (~0)
- shop_seo_storefront_field_value (~0)
- shop_seo_storefront_settings (~21)
- shop_service (~0)
- shop_service_variants (~0)
- shop_set (~4)
- shop_set_group (~0)
- shop_set_products (~1598)
- shop_srt_imgs (~13)
- shop_stock (~0)
- shop_stock_rules (~0)
- shop_tag (~0)
- shop_tax (~2)
- shop_tax_regions (~1)
- shop_tax_zip_codes (~0)
- shop_transfer (~0)
- shop_transfer_products (~0)
- shop_type (~1)
- shop_type_codes (~0)
- shop_type_features (~9)
- shop_type_services (~0)
- shop_type_upselling (~0)
- shop_unit (~20)
- shop_usercommerce (~681)
- shop_usercommerce_products (~17787)
- shop_usercontacts (~41)
- shop_userorgs_orgs (~1543)
- shop_userorgs_orgs_order (~34593)
- shop_usershipadreses (~754)
- shop_usershipadreses_phones (~778)
- shop_virtualstock (~0)
- shop_virtualstock_stocks (~0)
- shop_yosli_slide (~3)
- shop_youcity_cities (~0)
- site_block (~8)
- site_blockpage (~0)
- site_blockpage_block_files (~0)
- site_blockpage_blocks (~0)
- site_blockpage_file (~0)
- site_blockpage_params (~0)
- site_domain (~1)
- site_globalblock (~0)
- site_page (~12)
- site_page_params (~28)
- site_variable (~4)
- team_calendar_external (~0)
- team_calendar_external_params (~0)
- team_event_external (~0)
- team_event_external_params (~0)
- team_location (~0)
- wa_agreement_document (~0)
- wa_agreement_log (~34)
- wa_announcement (~25)
- wa_announcement_comments (~0)
- wa_announcement_reactions (~0)
- wa_announcement_rights (~0)
- wa_api_auth_codes (~1)
- wa_api_tokens (~1)
- wa_app_settings (~408)
- wa_app_tokens (~0)
- wa_cache (~0)
- wa_contact (~7264)
- wa_contact_auths (~8511)
- wa_contact_calendars (~6)
- wa_contact_categories (~12134)
- wa_contact_category (~5)
- wa_contact_data (~34595)
- wa_contact_data_text (~0)
- wa_contact_emails (~6520)
- wa_contact_events (~0)
- wa_contact_field_values (~0)
- wa_contact_files (~0)
- wa_contact_rights (~6)
- wa_contact_settings (~4292)
- wa_contact_waid (~1)
- wa_country (~251)
- wa_cron_data (~0)
- wa_dashboard (~0)
- wa_group (~2)
- wa_log (~357376)
- wa_login_log (~2907206)
- wa_push_subscribers (~0)
- wa_region (~174)
- wa_transaction (~0)
- wa_transaction_data (~0)
- wa_two_prices (~5972)
- wa_user_groups (~2)
- wa_verification_channel (~1)
- wa_verification_channel_assets (~0)
- wa_verification_channel_params (~1)
- wa_widget (~55)
- wa_widget_params (~97)

## shop_* tables (catalog — OfferKP)

### `shop_abtest` (~0 rows)
Columns:
- `id` int unsigned — PRI NOT NULL auto_increment
- `name` varchar(255)
- `create_datetime` datetime — NOT NULL
Sample rows: _(empty)_

### `shop_abtest_variants` (~0 rows)
Columns:
- `id` int unsigned — PRI NOT NULL auto_increment
- `abtest_id` int unsigned — MUL NOT NULL
- `code` varchar(16) — NOT NULL
- `name` varchar(255)
Sample rows: _(empty)_

### `shop_affiliate_transaction` (~0 rows)
Columns:
- `id` int unsigned — PRI NOT NULL auto_increment
- `contact_id` int unsigned — MUL NOT NULL
- `create_datetime` datetime — NOT NULL
- `order_id` int unsigned
- `amount` decimal(15,4) — NOT NULL
- `balance` decimal(15,4) — NOT NULL
- `comment` text
- `type` varchar(32)
Sample rows: _(empty)_

### `shop_api_courier` (~0 rows)
Columns:
- `id` int — PRI NOT NULL auto_increment
- `name` varchar(255) — NOT NULL
- `enabled` int — NOT NULL
- `contact_id` int
- `create_datetime` datetime — NOT NULL
- `orders_processed` int — NOT NULL
- `note` text
- `api_token` varchar(32)
- `api_pin` varchar(32)
- `api_pin_expire` datetime
- `api_last_use` datetime
- `all_storefronts` int — NOT NULL
- `rights_order_edit` int — NOT NULL
- `rights_customer_edit` int — NOT NULL
Sample rows: _(empty)_

### `shop_api_courier_storefronts` (~0 rows)
Columns:
- `courier_id` int — MUL NOT NULL
- `storefront` varchar(255) — NOT NULL
Sample rows: _(empty)_

### `shop_arrived` (~601 rows)
Columns:
- `id` int — PRI NOT NULL auto_increment
- `user_id` int
- `product_id` int — NOT NULL
- `sku_id` int — NOT NULL
- `domain` varchar(100) — NOT NULL
- `route_url` varchar(255) — NOT NULL
- `email` varchar(100)
- `phone` varchar(20)
- `sended` int — NOT NULL
- `expired` int — NOT NULL
- `date_sended` datetime
- `expiration` datetime
- `created` datetime — NOT NULL
Sample rows: _redacted (live data omitted)_


### `shop_callb_request` (~211 rows)
Columns:
- `id` int — PRI NOT NULL auto_increment
- `contact_id` int
- `create_datetime` datetime — NOT NULL
- `name` text
- `phone` text
- `status` text
- `url` text — NOT NULL
- `comment` text — NOT NULL
Sample rows: _redacted (live data omitted)_


### `shop_cart_items` (~110919 rows)
Columns:
- `id` int — PRI NOT NULL auto_increment
- `code` varchar(32) — MUL
- `contact_id` int
- `product_id` int — NOT NULL
- `sku_id` int — NOT NULL
- `create_datetime` datetime — NOT NULL
- `quantity` decimal(15,3) — NOT NULL
- `type` enum('product','service') — NOT NULL
- `service_id` int
- `service_variant_id` int
- `parent_id` int
Sample rows: _redacted (live data omitted)_


### `shop_category` (~125 rows)
Columns:
- `id` int — PRI NOT NULL auto_increment
- `left_key` int — MUL
- `right_key` int
- `depth` int — NOT NULL
- `parent_id` int — MUL NOT NULL
- `name` varchar(255)
- `meta_title` varchar(255)
- `meta_keywords` text
- `meta_description` text
- `thumb_ext` varchar(8)
- `type` int — NOT NULL
- `url` varchar(255)
- `full_url` varchar(255) — UNI
- `count` int — NOT NULL
- `description` mediumtext
- `conditions` text
- `create_datetime` datetime — NOT NULL
- `edit_datetime` datetime
- `filter` text
- `sort_products` varchar(255)
- `include_sub_categories` tinyint(1) — NOT NULL
- `status` tinyint(1) — NOT NULL
Sample rows: _redacted (live data omitted)_


### `shop_category_og` (~0 rows)
Columns:
- `category_id` int — PRI NOT NULL
- `property` varchar(255) — PRI NOT NULL
- `content` text — NOT NULL
Sample rows: _(empty)_

### `shop_category_params` (~110 rows)
Columns:
- `category_id` int — PRI NOT NULL
- `name` varchar(255) — PRI NOT NULL
- `value` text — NOT NULL
Sample rows: _redacted (live data omitted)_


### `shop_category_products` (~22293 rows)
Columns:
- `product_id` int — PRI NOT NULL
- `category_id` int — PRI NOT NULL
- `sort` int — NOT NULL
Sample rows: _redacted (live data omitted)_


### `shop_category_routes` (~0 rows)
Columns:
- `category_id` int — PRI NOT NULL
- `route` varchar(255) — PRI NOT NULL
Sample rows: _(empty)_

### `shop_catimg` (~216 rows)
Columns:
- `id` int — PRI NOT NULL auto_increment
- `category_id` int — MUL NOT NULL
- `icon` varchar(255)
- `image` varchar(255)
- `promo` varchar(255)
- `banner` varchar(255)
- `custom` varchar(255)
Sample rows: _redacted (live data omitted)_


### `shop_checkout_flow` (~308319 rows)
Columns:
- `id` int — PRI NOT NULL auto_increment
- `code` varchar(32) — MUL
- `contact_id` int
- `date` date
- `year` smallint
- `quarter` smallint
- `month` smallint
- `step` tinyint — NOT NULL
- `description` text
Sample rows: _redacted (live data omitted)_


### `shop_contact_category_discount` (~1 rows)
Columns:
- `category_id` int unsigned — PRI NOT NULL
- `discount` decimal(15,4) — NOT NULL
Sample rows: _redacted (live data omitted)_


### `shop_coupon` (~2 rows)
Columns:
- `id` int unsigned — PRI NOT NULL auto_increment
- `code` varchar(32) — UNI NOT NULL
- `type` varchar(3) — NOT NULL
- `limit` int
- `used` int — NOT NULL
- `value` decimal(15,4)
- `url` text
- `comment` text
- `expire_datetime` datetime
- `create_datetime` datetime — NOT NULL
- `create_contact_id` int unsigned — NOT NULL
- `products_hash` text
Sample rows: _redacted (live data omitted)_


### `shop_currency` (~4 rows)
Columns:
- `code` char(3) — PRI NOT NULL
- `rate` decimal(18,10) — NOT NULL
- `rounding` decimal(8,2)
- `round_up_only` int — NOT NULL
- `sort` int — NOT NULL
Sample rows: _redacted (live data omitted)_


### `shop_customer` (~6009 rows)
Columns:
- `contact_id` int unsigned — PRI NOT NULL
- `total_spent` decimal(15,4) — NOT NULL
- `affiliate_bonus` decimal(15,4) — NOT NULL
- `number_of_orders` int unsigned — NOT NULL
- `last_order_id` int unsigned
- `source` varchar(255)
Sample rows: _redacted (live data omitted)_


### `shop_customers_filter` (~5 rows)
Columns:
- `id` int — PRI NOT NULL auto_increment
- `name` varchar(255) — NOT NULL
- `hash` text
- `create_datetime` datetime — NOT NULL
- `contact_id` int — MUL NOT NULL
- `mass_edit` int
- `icon` varchar(255)
Sample rows: _redacted (live data omitted)_


### `shop_discount_by_sum` (~0 rows)
Columns:
- `type` varchar(32) — NOT NULL
- `sum` decimal(15,4) — NOT NULL
- `discount` decimal(15,4) — NOT NULL
Sample rows: _(empty)_

### `shop_error301` (~24590 rows)
Columns:
- `id` int
- `type` varchar(1) — MUL
- `url` varchar(255)
- `parent` int
Sample rows: _redacted (live data omitted)_


### `shop_events` (~0 rows)
Columns:
- `id` int
- `text` text
- `public` int
Sample rows: _(empty)_

### `shop_expense` (~0 rows)
Columns:
- `id` int — PRI NOT NULL auto_increment
- `type` varchar(16) — NOT NULL
- `name` varchar(255) — NOT NULL
- `storefront` varchar(255)
- `start` date — MUL NOT NULL
- `end` date — NOT NULL
- `amount` decimal(15,4) — NOT NULL
- `color` varchar(7)
- `note` text
Sample rows: _(empty)_

### `shop_favgoods_items` (~169 rows)
Columns:
- `id` int — PRI NOT NULL auto_increment
- `hash` varchar(32) — MUL
- `contact_id` int
- `product_id` text
- `modified_datetime` datetime — NOT NULL
Sample rows: _redacted (live data omitted)_


### `shop_feature` (~8 rows)
Columns:
- `id` int — PRI NOT NULL auto_increment
- `parent_id` int
- `code` varchar(64) — UNI NOT NULL
- `status` enum('public','hidden','private') — NOT NULL
- `name` varchar(255)
- `type` varchar(255)
- `selectable` int — NOT NULL
- `multiple` int — NOT NULL
- `count` int unsigned — NOT NULL
- `available_for_sku` int
- `default_unit` varchar(255)
- `builtin` int
Sample rows: _redacted (live data omitted)_


### `shop_feature_values_color` (~0 rows)
Columns:
- `id` int — PRI NOT NULL auto_increment
- `feature_id` int — MUL NOT NULL
- `sort` int — NOT NULL
- `code` mediumint unsigned
- `value` varchar(255) — NOT NULL
Sample rows: _(empty)_

### `shop_feature_values_dimension` (~7192 rows)
Columns:
- `id` int — PRI NOT NULL auto_increment
- `feature_id` int — NOT NULL
- `sort` int — NOT NULL
- `value` double — NOT NULL
- `unit` varchar(255) — NOT NULL
- `type` varchar(16) — NOT NULL
- `value_base_unit` double — NOT NULL
Sample rows: _redacted (live data omitted)_


### `shop_feature_values_double` (~0 rows)
Columns:
- `id` int — PRI NOT NULL auto_increment
- `feature_id` int — MUL NOT NULL
- `sort` int — NOT NULL
- `value` double — NOT NULL
Sample rows: _(empty)_

### `shop_feature_values_range` (~0 rows)
Columns:
- `id` int — PRI NOT NULL auto_increment
- `feature_id` int — MUL NOT NULL
- `sort` int — NOT NULL
- `begin` double
- `end` double
- `unit` varchar(255) — NOT NULL
- `type` varchar(16) — NOT NULL
- `begin_base_unit` double
- `end_base_unit` double
Sample rows: _(empty)_

### `shop_feature_values_text` (~0 rows)
Columns:
- `id` int — PRI NOT NULL auto_increment
- `feature_id` int — NOT NULL
- `sort` int — NOT NULL
- `value` text — NOT NULL
Sample rows: _(empty)_

### `shop_feature_values_varchar` (~259 rows)
Columns:
- `id` int — PRI NOT NULL auto_increment
- `feature_id` int — NOT NULL
- `sort` int — NOT NULL
- `value` varchar(255) — NOT NULL
Sample rows: _redacted (live data omitted)_


### `shop_filter` (~4 rows)
Columns:
- `id` int unsigned — PRI NOT NULL auto_increment
- `parent_id` int unsigned
- `name` varchar(255)
- `creator_contact_id` int — MUL NOT NULL
- `sort` int — NOT NULL
Sample rows: _redacted (live data omitted)_


### `shop_filter_rules` (~6 rows)
Columns:
- `id` int unsigned — PRI NOT NULL auto_increment
- `filter_id` int unsigned — MUL NOT NULL
- `rule_type` varchar(255) — NOT NULL
- `rule_params` longtext
- `rule_group` int — NOT NULL
- `open_interval` int
Sample rows: _redacted (live data omitted)_


### `shop_followup` (~0 rows)
Columns:
- `id` int unsigned — PRI NOT NULL auto_increment
- `name` varchar(255) — NOT NULL
- `delay` int unsigned — NOT NULL
- `first_order_only` tinyint unsigned — NOT NULL
- `same_state_id` tinyint
- `subject` text — NOT NULL
- `body` text — NOT NULL
- `last_cron_time` datetime — NOT NULL
- `from` varchar(32)
- `status` tinyint(1) — NOT NULL
- `transport` enum('sms','email') — NOT NULL
- `state_id` varchar(32) — NOT NULL
Sample rows: _(empty)_

### `shop_followup_sources` (~0 rows)
Columns:
- `followup_id` int — MUL NOT NULL
- `source` varchar(510) — MUL
Sample rows: _(empty)_

### `shop_group_srt` (~2 rows)
Columns:
- `id` int — PRI NOT NULL auto_increment
- `comment` text
- `name` text
- `create_datetime` datetime
Sample rows: _redacted (live data omitted)_


### `shop_importexport` (~4 rows)
Columns:
- `id` int — PRI NOT NULL auto_increment
- `plugin` varchar(64) — MUL NOT NULL
- `sort` int — NOT NULL
- `name` varchar(255)
- `description` text
- `config` text
Sample rows: _redacted (live data omitted)_


### `shop_lastmodified_hash` (~88557 rows)
Columns:
- `url` varchar(255) — PRI NOT NULL
- `hash` varchar(32) — NOT NULL
- `date` datetime — NOT NULL
Sample rows: _redacted (live data omitted)_


### `shop_lastmodified_settings` (~12 rows)
Columns:
- `group` varchar(32) — PRI NOT NULL
- `name` varchar(32) — PRI NOT NULL
- `value` text
Sample rows: _redacted (live data omitted)_


### `shop_linkcanonical_category_canonical` (~0 rows)
Columns:
- `hash` varchar(32) — MUL NOT NULL
- `category_id` int — MUL NOT NULL
- `storefront` varchar(2048) — NOT NULL
- `canonical` varchar(2048) — NOT NULL
Sample rows: _(empty)_

### `shop_linkcanonical_product_canonical` (~0 rows)
Columns:
- `hash` varchar(32) — MUL NOT NULL
- `product_id` int — MUL NOT NULL
- `storefront` varchar(2048) — NOT NULL
- `canonical` varchar(2048) — NOT NULL
Sample rows: _(empty)_

### `shop_notification` (~7 rows)
Columns:
- `id` int — PRI NOT NULL auto_increment
- `name` varchar(128) — NOT NULL
- `event` varchar(64) — MUL NOT NULL
- `transport` enum('email','sms','http') — NOT NULL
- `status` tinyint(1) — NOT NULL
Sample rows: _redacted (live data omitted)_


### `shop_notification_params` (~22 rows)
Columns:
- `notification_id` int — PRI NOT NULL
- `name` varchar(64) — PRI NOT NULL
- `value` text — NOT NULL
Sample rows: _redacted (live data omitted)_


### `shop_notification_sources` (~5 rows)
Columns:
- `notification_id` int — MUL NOT NULL
- `source` varchar(510) — MUL
Sample rows: _redacted (live data omitted)_


### `shop_oneclick_data` (~18 rows)
Columns:
- `id` int — PRI NOT NULL auto_increment
- `profile_id` int — NOT NULL
- `name` varchar(255)
- `value` text
Sample rows: _redacted (live data omitted)_


### `shop_oneclick_profile` (~1 rows)
Columns:
- `id` int — PRI NOT NULL auto_increment
- `name` varchar(255)
- `storefronts` text
Sample rows: _redacted (live data omitted)_


### `shop_opt_prices` (~34760 rows)
Columns:
- `id` int — PRI NOT NULL auto_increment
- `user_category_id` int — NOT NULL
- `product_id` int — MUL
- `sku_id` int — MUL
- `service_id` int
- `price` decimal(15,4) — NOT NULL
Sample rows: _redacted (live data omitted)_


### `shop_order` (~318832 rows)
Columns:
- `id` int — PRI NOT NULL auto_increment
- `contact_id` int — MUL
- `create_datetime` datetime — NOT NULL
- `update_datetime` datetime
- `state_id` varchar(32) — MUL NOT NULL
- `total` decimal(15,4) — NOT NULL
- `currency` char(3) — NOT NULL
- `rate` decimal(15,8) — NOT NULL
- `tax` decimal(15,4) — NOT NULL
- `shipping` decimal(15,4) — NOT NULL
- `discount` decimal(15,4) — NOT NULL
- `assigned_contact_id` int — MUL
- `paid_year` smallint
- `paid_quarter` smallint
- `paid_month` smallint
- `paid_date` date — MUL
- `paid_datetime` datetime
- `auth_date` date
- `is_first` tinyint(1) — NOT NULL
- `unsettled` tinyint(1) — NOT NULL
- `comment` text
- `shipping_datetime` datetime — MUL
- `courier_contact_id` int — MUL
- `fulfillment_contact_id` int — MUL
- `cashier_contact_id` int — MUL
- `manager_contact_id` int — MUL
Sample rows: _redacted (live data omitted)_


### `shop_order_assign_rules` (~0 rows)
Columns:
- `id` int — PRI NOT NULL auto_increment
- `sort` int — NOT NULL
- `action_id` varchar(255) — NOT NULL
- `conditions` text
- `rule_data` text
Sample rows: _(empty)_

### `shop_order_item_codes` (~0 rows)
Columns:
- `order_id` int — MUL NOT NULL
- `order_item_id` int — MUL NOT NULL
- `code_id` int
- `code` varchar(64) — NOT NULL
- `value` text — NOT NULL
- `sort` int — NOT NULL
Sample rows: _(empty)_

### `shop_order_items` (~1141524 rows)
Columns:
- `id` int — PRI NOT NULL auto_increment
- `order_id` int — MUL NOT NULL
- `name` varchar(255) — NOT NULL
- `product_id` int — MUL NOT NULL
- `sku_id` int — NOT NULL
- `sku_code` varchar(255) — NOT NULL
- `type` enum('product','service') — NOT NULL
- `service_id` int
- `service_variant_id` int
- `price` decimal(15,4) — NOT NULL
- `quantity` decimal(15,3) — NOT NULL
- `quantity_denominator` int unsigned — NOT NULL
- `parent_id` int
- `stock_id` int
- `virtualstock_id` int
- `purchase_price` decimal(15,4) — NOT NULL
- `compare_price` decimal(15,4) — NOT NULL
- `total_discount` decimal(15,4) — NOT NULL
- `tax_percent` decimal(7,4)
- `tax_included` int — NOT NULL
- `stock_unit_id` int — NOT NULL
Sample rows: _redacted (live data omitted)_


### `shop_order_log` (~282806 rows)
Columns:
- `id` int — PRI NOT NULL auto_increment
- `order_id` int — MUL NOT NULL
- `contact_id` int
- `action_id` varchar(32) — NOT NULL
- `datetime` datetime — MUL NOT NULL
- `before_state_id` varchar(32) — NOT NULL
- `after_state_id` varchar(32) — NOT NULL
- `text` text
Sample rows: _redacted (live data omitted)_


### `shop_order_log_params` (~1 rows)
Columns:
- `id` int — PRI NOT NULL auto_increment
- `order_id` int — MUL NOT NULL
- `log_id` int — NOT NULL
- `name` varchar(255) — NOT NULL
- `value` text — NOT NULL
Sample rows: _redacted (live data omitted)_


### `shop_order_params` (~5558843 rows)
Columns:
- `order_id` int — PRI NOT NULL
- `name` varchar(64) — PRI NOT NULL
- `value` varchar(255) — NOT NULL
Sample rows: _redacted (live data omitted)_


### `shop_page` (~2 rows)
Columns:
- `id` int — PRI NOT NULL auto_increment
- `parent_id` int
- `domain` varchar(255)
- `route` varchar(255)
- `name` varchar(255) — NOT NULL
- `title` varchar(255) — NOT NULL
- `url` varchar(255)
- `full_url` varchar(255)
- `content` mediumtext — NOT NULL
- `create_datetime` datetime — NOT NULL
- `update_datetime` datetime — NOT NULL
- `create_contact_id` int — NOT NULL
- `sort` int — NOT NULL
- `status` tinyint(1) — NOT NULL
Sample rows: _redacted (live data omitted)_


### `shop_page_params` (~4 rows)
Columns:
- `page_id` int — PRI NOT NULL
- `name` varchar(255) — PRI NOT NULL
- `value` text — NOT NULL
Sample rows: _redacted (live data omitted)_


### `shop_plugin` (~4 rows)
Columns:
- `id` int — PRI NOT NULL auto_increment
- `type` varchar(255) — MUL NOT NULL
- `plugin` varchar(255) — NOT NULL
- `name` varchar(255) — NOT NULL
- `description` text — NOT NULL
- `logo` text — NOT NULL
- `status` int — NOT NULL
- `sort` int — NOT NULL
- `options` text
Sample rows: _redacted (live data omitted)_


### `shop_plugin_settings` (~15 rows)
Columns:
- `id` int — PRI NOT NULL
- `name` varchar(64) — PRI NOT NULL
- `value` mediumtext — NOT NULL
Sample rows: _redacted (live data omitted)_


### `shop_presentation` (~10 rows)
Columns:
- `id` int unsigned — PRI NOT NULL auto_increment
- `parent_id` int unsigned
- `name` varchar(255)
- `creator_contact_id` int — MUL NOT NULL
- `use_datetime` datetime
- `sort_column_id` int unsigned
- `sort` int — NOT NULL
- `sort_order` enum('asc','desc') — NOT NULL
- `view` enum('table','table_extended','thumbs') — NOT NULL
- `rows_on_page` int — NOT NULL
- `browser` varchar(64)
- `filter_id` int
Sample rows: _redacted (live data omitted)_


### `shop_presentation_columns` (~89 rows)
Columns:
- `id` int unsigned — PRI NOT NULL auto_increment
- `presentation_id` int unsigned — MUL NOT NULL
- `column_type` varchar(64) — NOT NULL
- `width` int
- `data` text
- `sort` int — NOT NULL
Sample rows: _redacted (live data omitted)_


### `shop_price` (~2 rows)
Columns:
- `id` int — PRI NOT NULL auto_increment
- `name` varchar(255) — NOT NULL
- `currency` char(3)
- `sort` int — NOT NULL
Sample rows: _redacted (live data omitted)_


### `shop_price_params` (~2 rows)
Columns:
- `price_id` int — MUL NOT NULL
- `route_hash` varchar(255) — NOT NULL
- `category_id` int — NOT NULL
Sample rows: _redacted (live data omitted)_


### `shop_product` (~18510 rows)
Columns:
- `id` int — PRI NOT NULL auto_increment
- `name` varchar(255)
- `summary` text
- `meta_title` varchar(255)
- `meta_keywords` text
- `meta_description` text
- `description` mediumtext
- `contact_id` int
- `create_datetime` datetime — NOT NULL
- `edit_datetime` datetime
- `status` tinyint(1) — NOT NULL
- `type_id` int
- `image_id` int
- `image_filename` varchar(255) — NOT NULL
- `video_url` varchar(255)
- `sku_id` int
- `ext` varchar(10)
- `url` varchar(255) — MUL
- `rating` decimal(3,2) — NOT NULL
- `price` decimal(15,4) — NOT NULL
- `compare_price` decimal(15,4) — NOT NULL
- `currency` char(3)
- `min_price` decimal(15,4) — NOT NULL
- `max_price` decimal(15,4) — NOT NULL
- `tax_id` int
- `count` decimal(15,3)
- `count_denominator` int unsigned — NOT NULL
- `order_multiplicity_factor` decimal(9,3) — NOT NULL
- `stock_unit_id` int — NOT NULL
- `base_unit_id` int — NOT NULL
- `stock_base_ratio` decimal(16,8) unsigned — NOT NULL
- `order_count_min` decimal(15,3) unsigned — NOT NULL
- `order_count_step` decimal(15,3) unsigned — NOT NULL
- `base_price` decimal(15,4) unsigned — NOT NULL
- `min_base_price` decimal(15,4) unsigned — NOT NULL
- `max_base_price` decimal(15,4) unsigned — NOT NULL
- `cross_selling` tinyint(1)
- `upselling` tinyint(1)
- `rating_count` int — NOT NULL
- `total_sales` decimal(15,4) — MUL NOT NULL
- `category_id` int
- `badge` text
- `sku_type` tinyint(1) — NOT NULL
- `base_price_selectable` decimal(15,4) — NOT NULL
- `compare_price_selectable` decimal(15,4) — NOT NULL
- `purchase_price_selectable` decimal(15,4) — NOT NULL
- `sku_count` int — NOT NULL
- `cs_natsort` int unsigned
Sample rows: _redacted (live data omitted)_


### `shop_product_code` (~0 rows)
Columns:
- `id` int — PRI NOT NULL auto_increment
- `code` varchar(64) — NOT NULL
- `name` varchar(255) — NOT NULL
- `icon` varchar(255)
- `logo` varchar(255)
- `protected` tinyint(1)
- `plugin_id` varchar(255)
Sample rows: _(empty)_

### `shop_product_features` (~119747 rows)
Columns:
- `id` int — PRI NOT NULL auto_increment
- `product_id` int — MUL NOT NULL
- `sku_id` int
- `feature_id` int — MUL NOT NULL
- `feature_value_id` int — NOT NULL
Sample rows: _redacted (live data omitted)_


### `shop_product_features_selectable` (~0 rows)
Columns:
- `product_id` int — PRI NOT NULL
- `feature_id` int — PRI NOT NULL
- `value_id` int — PRI NOT NULL
- `sort` int — NOT NULL
Sample rows: _(empty)_

### `shop_product_images` (~15373 rows)
Columns:
- `id` int — PRI NOT NULL auto_increment
- `product_id` int — MUL NOT NULL
- `upload_datetime` datetime — NOT NULL
- `edit_datetime` datetime
- `description` varchar(255)
- `sort` int — NOT NULL
- `width` int — NOT NULL
- `height` int — NOT NULL
- `size` int
- `filename` varchar(255) — NOT NULL
- `original_filename` varchar(255)
- `ext` varchar(10)
- `badge_type` int
- `badge_code` text
Sample rows: _redacted (live data omitted)_


### `shop_product_og` (~0 rows)
Columns:
- `product_id` int — PRI NOT NULL
- `property` varchar(255) — PRI NOT NULL
- `content` text — NOT NULL
Sample rows: _(empty)_

### `shop_product_pages` (~0 rows)
Columns:
- `id` int — PRI NOT NULL auto_increment
- `product_id` int — MUL
- `name` varchar(255) — NOT NULL
- `title` varchar(255) — NOT NULL
- `url` varchar(255)
- `content` mediumtext — NOT NULL
- `create_datetime` datetime — NOT NULL
- `update_datetime` datetime — NOT NULL
- `create_contact_id` int — NOT NULL
- `sort` int — NOT NULL
- `status` tinyint(1) — NOT NULL
- `keywords` text
- `description` text
Sample rows: _(empty)_

### `shop_product_params` (~4 rows)
Columns:
- `product_id` int — PRI NOT NULL
- `name` varchar(255) — PRI NOT NULL
- `value` text — NOT NULL
Sample rows: _redacted (live data omitted)_


### `shop_product_related` (~0 rows)
Columns:
- `product_id` int — PRI NOT NULL
- `type` enum('cross_selling','upselling') — PRI NOT NULL
- `related_product_id` int — PRI NOT NULL
- `sort` int — NOT NULL
Sample rows: _(empty)_

### `shop_product_reviews` (~0 rows)
Columns:
- `id` int — PRI NOT NULL auto_increment
- `left_key` int
- `right_key` int
- `depth` int — NOT NULL
- `parent_id` int — MUL NOT NULL
- `product_id` int — MUL NOT NULL
- `review_id` int — NOT NULL
- `datetime` datetime — NOT NULL
- `status` enum('approved','deleted','moderation') — MUL NOT NULL
- `title` varchar(64)
- `text` text
- `rate` decimal(3,2)
- `contact_id` int unsigned — MUL NOT NULL
- `name` varchar(50)
- `images_count` int
- `email` varchar(50)
- `site` varchar(100)
- `auth_provider` varchar(100)
- `ip` int
Sample rows: _(empty)_

### `shop_product_reviews_images` (~0 rows)
Columns:
- `id` int — PRI NOT NULL auto_increment
- `review_id` int
- `product_id` int
- `upload_datetime` datetime — NOT NULL
- `edit_datetime` datetime
- `description` varchar(255)
- `sort` int
- `width` int
- `height` int
- `size` int
- `filename` varchar(255)
- `original_filename` varchar(255)
- `ext` varchar(10)
Sample rows: _(empty)_

### `shop_product_services` (~0 rows)
Columns:
- `id` int — PRI NOT NULL auto_increment
- `product_id` int — MUL NOT NULL
- `sku_id` int
- `service_id` int — MUL NOT NULL
- `service_variant_id` int — NOT NULL
- `price` decimal(15,4)
- `primary_price` decimal(15,4)
- `status` tinyint(1) — NOT NULL
Sample rows: _(empty)_

### `shop_product_skus` (~18513 rows)
Columns:
- `id` int — PRI NOT NULL auto_increment
- `product_id` int — MUL NOT NULL
- `sku` varchar(255) — NOT NULL
- `sort` int — NOT NULL
- `name` varchar(255) — NOT NULL
- `image_id` int
- `price` decimal(15,4) — NOT NULL
- `primary_price` decimal(15,4) — NOT NULL
- `purchase_price` decimal(15,4) — NOT NULL
- `compare_price` decimal(15,4) — NOT NULL
- `count` decimal(15,3)
- `available` tinyint(1) — NOT NULL
- `stock_base_ratio` decimal(16,8) unsigned
- `order_count_min` decimal(15,3) unsigned
- `order_count_step` decimal(15,3) unsigned
- `status` tinyint(1) — NOT NULL
- `dimension_id` int
- `file_name` varchar(255) — NOT NULL
- `file_size` int — NOT NULL
- `file_description` text
- `virtual` tinyint(1) — NOT NULL
- `price_plugin_1` decimal(15,4) — NOT NULL
- `price_plugin_type_1` enum('','%','+') — NOT NULL
- `price_plugin_currency_1` char(3)
- `price_plugin_markup_price_1` enum('price','purchase_price') — NOT NULL
- `price_plugin_2` decimal(15,4) — NOT NULL
- `price_plugin_type_2` enum('','%','+') — NOT NULL
- `price_plugin_currency_2` char(3)
- `price_plugin_markup_price_2` enum('price','purchase_price') — NOT NULL
Sample rows: _redacted (live data omitted)_


### `shop_product_stocks` (~0 rows)
Columns:
- `sku_id` int — PRI NOT NULL
- `stock_id` int — PRI NOT NULL
- `product_id` int — MUL NOT NULL
- `count` decimal(15,3) — NOT NULL
Sample rows: _(empty)_

### `shop_product_stocks_log` (~1174383 rows)
Columns:
- `id` int — PRI NOT NULL auto_increment
- `product_id` int — MUL NOT NULL
- `sku_id` int — NOT NULL
- `stock_id` int — MUL
- `stock_name` varchar(255)
- `before_count` decimal(15,3)
- `after_count` decimal(15,3)
- `diff_count` decimal(15,3)
- `type` varchar(32) — NOT NULL
- `description` text
- `datetime` datetime — NOT NULL
- `order_id` int
- `transfer_id` int
Sample rows: _redacted (live data omitted)_


### `shop_product_tags` (~0 rows)
Columns:
- `product_id` int — PRI NOT NULL
- `tag_id` int — PRI NOT NULL
Sample rows: _(empty)_

### `shop_promo` (~4 rows)
Columns:
- `id` int unsigned — PRI NOT NULL auto_increment
- `name` text
- `enabled` tinyint(1) — NOT NULL
- `consider_end_orders` tinyint(1)
- `text_id` varchar(64)
- `note` text
- `start_datetime` datetime
- `finish_datetime` datetime
- `author_contact_id` int
- `create_datetime` datetime
- `update_datetime` datetime
Sample rows: _redacted (live data omitted)_


### `shop_promo_orders` (~0 rows)
Columns:
- `order_id` int unsigned — PRI NOT NULL
- `promo_id` int unsigned — PRI NOT NULL
Sample rows: _(empty)_

### `shop_promo_routes` (~8 rows)
Columns:
- `promo_id` int unsigned — PRI NOT NULL
- `storefront` varchar(255) — PRI NOT NULL
- `sort` int — NOT NULL
Sample rows: _redacted (live data omitted)_


### `shop_promo_rules` (~4 rows)
Columns:
- `id` int unsigned — PRI NOT NULL auto_increment
- `promo_id` int unsigned — MUL NOT NULL
- `rule_type` varchar(32) — MUL NOT NULL
- `rule_params` longtext
Sample rows: _redacted (live data omitted)_


### `shop_push_client` (~0 rows)
Columns:
- `contact_id` int — NOT NULL
- `client_id` varchar(64) — PRI NOT NULL
- `shop_url` varchar(255) — NOT NULL
- `type` varchar(255) — NOT NULL
- `api_token` varchar(32)
- `create_datetime` datetime
Sample rows: _(empty)_

### `shop_sales` (~0 rows)
Columns:
- `hash` varchar(32) — PRI NOT NULL
- `date` date — PRI NOT NULL
- `name` varchar(255) — PRI NOT NULL
- `order_count` int — NOT NULL
- `sales` float — NOT NULL
- `shipping` float — NOT NULL
- `tax` float — NOT NULL
- `purchase` float — NOT NULL
- `cost` float — NOT NULL
- `new_customer_count` int — NOT NULL
Sample rows: _(empty)_

### `shop_sales_channel` (~0 rows)
Columns:
- `id` int — PRI NOT NULL auto_increment
- `type` varchar(255) — NOT NULL
- `name` varchar(255) — NOT NULL
- `description` text
- `wa_channel_id` varchar(32)
- `status` int — NOT NULL
- `sort` int — NOT NULL
Sample rows: _(empty)_

### `shop_sales_channel_params` (~0 rows)
Columns:
- `channel_id` int — PRI NOT NULL
- `name` varchar(255) — PRI NOT NULL
- `value` text — NOT NULL
Sample rows: _(empty)_

### `shop_saveredirect` (~0 rows)
Columns:
- `id` int — PRI NOT NULL auto_increment
- `url_redirect` varchar(255)
- `url_new` varchar(255)
- `domain` varchar(255) — NOT NULL
- `create` varchar(255) — NOT NULL
- `edit_datetime` datetime — NOT NULL
- `last_click_date` date
Sample rows: _(empty)_

### `shop_search_index` (~462765 rows)
Columns:
- `word_id` int — PRI NOT NULL
- `product_id` int — PRI NOT NULL
- `weight` int — NOT NULL
Sample rows: _redacted (live data omitted)_


### `shop_search_word` (~9355 rows)
Columns:
- `id` int — PRI NOT NULL auto_increment
- `name` varchar(255) — UNI NOT NULL
Sample rows: _redacted (live data omitted)_


### `shop_seo_category_field` (~1 rows)
Columns:
- `id` int — PRI NOT NULL auto_increment
- `name` varchar(255) — NOT NULL
Sample rows: _redacted (live data omitted)_


### `shop_seo_category_field_value` (~57 rows)
Columns:
- `group_storefront_id` int — PRI NOT NULL
- `category_id` int — PRI NOT NULL
- `field_id` int — PRI NOT NULL
- `value` text
Sample rows: _redacted (live data omitted)_


### `shop_seo_category_settings` (~276 rows)
Columns:
- `group_storefront_id` int — PRI NOT NULL
- `category_id` int — PRI NOT NULL
- `name` varchar(255) — PRI NOT NULL
- `value` text
Sample rows: _redacted (live data omitted)_


### `shop_seo_group_category` (~0 rows)
Columns:
- `id` int — PRI NOT NULL auto_increment
- `name` varchar(255) — NOT NULL
- `storefront_select_rule_type` enum('ANY','INCLUDE','EXCLUDE') — NOT NULL
- `category_select_rule_type` enum('ANY','INCLUDE','EXCLUDE') — NOT NULL
- `sort` int — NOT NULL
Sample rows: _(empty)_

### `shop_seo_group_category_category` (~0 rows)
Columns:
- `group_id` int — PRI NOT NULL
- `category_id` int — PRI NOT NULL
Sample rows: _(empty)_

### `shop_seo_group_category_field_value` (~0 rows)
Columns:
- `group_id` int — PRI NOT NULL
- `field_id` int — PRI NOT NULL
- `value` text
Sample rows: _(empty)_

### `shop_seo_group_category_settings` (~0 rows)
Columns:
- `group_id` int — PRI NOT NULL
- `name` varchar(255) — PRI NOT NULL
- `value` text
Sample rows: _(empty)_

### `shop_seo_group_category_storefront` (~0 rows)
Columns:
- `group_id` int — PRI NOT NULL
- `storefront` varchar(255) — PRI NOT NULL
Sample rows: _(empty)_

### `shop_seo_group_storefront` (~0 rows)
Columns:
- `id` int — PRI NOT NULL auto_increment
- `name` varchar(255) — NOT NULL
- `storefront_select_rule_type` enum('ANY','INCLUDE','EXCLUDE') — NOT NULL
- `sort` int — NOT NULL
Sample rows: _(empty)_

### `shop_seo_group_storefront_storefront` (~0 rows)
Columns:
- `group_id` int — PRI NOT NULL
- `storefront` varchar(255) — PRI NOT NULL
Sample rows: _(empty)_

### `shop_seo_plugin_settings` (~7 rows)
Columns:
- `name` varchar(255) — PRI NOT NULL
- `value` text
Sample rows: _redacted (live data omitted)_


### `shop_seo_product_field` (~0 rows)
Columns:
- `id` int — PRI NOT NULL auto_increment
- `name` varchar(255) — NOT NULL
Sample rows: _(empty)_

### `shop_seo_product_field_value` (~0 rows)
Columns:
- `group_storefront_id` int — PRI NOT NULL
- `product_id` int — PRI NOT NULL
- `field_id` int — PRI NOT NULL
- `value` text
Sample rows: _(empty)_

### `shop_seo_product_settings` (~0 rows)
Columns:
- `group_storefront_id` int — PRI NOT NULL
- `product_id` int — PRI NOT NULL
- `name` varchar(255) — PRI NOT NULL
- `value` text
Sample rows: _(empty)_

### `shop_seo_storefront_field` (~0 rows)
Columns:
- `id` int — PRI NOT NULL auto_increment
- `name` varchar(255) — NOT NULL
Sample rows: _(empty)_

### `shop_seo_storefront_field_value` (~0 rows)
Columns:
- `group_id` int — PRI NOT NULL
- `field_id` int — PRI NOT NULL
- `value` text
Sample rows: _(empty)_

### `shop_seo_storefront_settings` (~21 rows)
Columns:
- `group_id` int — PRI NOT NULL
- `name` varchar(255) — PRI NOT NULL
- `value` text
Sample rows: _redacted (live data omitted)_


### `shop_service` (~0 rows)
Columns:
- `id` int — PRI NOT NULL auto_increment
- `name` varchar(255)
- `description` text
- `price` decimal(15,4) — NOT NULL
- `currency` char(3)
- `variant_id` int — NOT NULL
- `tax_id` int
- `sort` int — NOT NULL
Sample rows: _(empty)_

### `shop_service_variants` (~0 rows)
Columns:
- `id` int — PRI NOT NULL auto_increment
- `service_id` int — MUL NOT NULL
- `name` varchar(255)
- `price` decimal(15,4) — NOT NULL
- `primary_price` decimal(15,4) — NOT NULL
- `sort` int — NOT NULL
Sample rows: _(empty)_

### `shop_set` (~4 rows)
Columns:
- `id` varchar(64) — PRI NOT NULL
- `group_id` int
- `name` varchar(255)
- `rule` varchar(255)
- `type` int
- `count` int — NOT NULL
- `sort` int — NOT NULL
- `sort_products` varchar(32)
- `create_datetime` datetime — NOT NULL
- `edit_datetime` datetime
- `json_params` text
Sample rows: _redacted (live data omitted)_


### `shop_set_group` (~0 rows)
Columns:
- `id` int — PRI NOT NULL auto_increment
- `name` varchar(255) — NOT NULL
- `sort` int — NOT NULL
Sample rows: _(empty)_

### `shop_set_products` (~1598 rows)
Columns:
- `set_id` varchar(64) — PRI NOT NULL
- `product_id` int — PRI NOT NULL
- `sort` int — NOT NULL
Sample rows: _redacted (live data omitted)_


### `shop_srt_imgs` (~13 rows)
Columns:
- `id` int — PRI NOT NULL auto_increment
- `group_srt` int — NOT NULL
- `image` text
- `change_image` text
- `ext` varchar(10)
- `real_img` text
- `real_ch_img` text
- `sort` int
- `create_datetime` datetime
Sample rows: _redacted (live data omitted)_


### `shop_stock` (~0 rows)
Columns:
- `id` int — PRI NOT NULL auto_increment
- `low_count` int — NOT NULL
- `critical_count` int — NOT NULL
- `sort` int — NOT NULL
- `name` varchar(255)
- `public` int — NOT NULL
Sample rows: _(empty)_

### `shop_stock_rules` (~0 rows)
Columns:
- `id` int — PRI NOT NULL auto_increment
- `sort` int — NOT NULL
- `stock_id` int
- `virtualstock_id` int
- `rule_type` varchar(255) — NOT NULL
- `rule_data` text
Sample rows: _(empty)_

### `shop_tag` (~0 rows)
Columns:
- `id` int — PRI NOT NULL auto_increment
- `name` varchar(255) — UNI NOT NULL
- `count` int — NOT NULL
Sample rows: _(empty)_

### `shop_tax` (~2 rows)
Columns:
- `id` int — PRI NOT NULL auto_increment
- `name` varchar(255) — NOT NULL
- `included` int — NOT NULL
- `address_type` varchar(8) — NOT NULL
Sample rows: _redacted (live data omitted)_


### `shop_tax_regions` (~1 rows)
Columns:
- `tax_id` int — MUL NOT NULL
- `country_iso3` varchar(3) — NOT NULL
- `region_code` varchar(8)
- `tax_value` decimal(7,4) — NOT NULL
- `tax_name` varchar(255)
- `params` text
Sample rows: _redacted (live data omitted)_


### `shop_tax_zip_codes` (~0 rows)
Columns:
- `tax_id` int — PRI NOT NULL
- `zip_expr` varchar(16) — PRI NOT NULL
- `tax_value` decimal(7,4) — NOT NULL
- `sort` int — NOT NULL
Sample rows: _(empty)_

### `shop_transfer` (~0 rows)
Columns:
- `id` int — PRI NOT NULL auto_increment
- `string_id` varchar(255) — UNI
- `create_datetime` datetime
- `finalize_datetime` datetime
- `status` enum('sent','completed','cancelled') — NOT NULL
- `stock_id_from` int — NOT NULL
- `stock_id_to` int — NOT NULL
- `currency` char(3)
Sample rows: _(empty)_

### `shop_transfer_products` (~0 rows)
Columns:
- `product_id` int — PRI NOT NULL
- `sku_id` int — PRI NOT NULL
- `transfer_id` int — PRI NOT NULL
- `count` decimal(15,3) — NOT NULL
- `price` decimal(15,4)
Sample rows: _(empty)_

### `shop_type` (~1 rows)
Columns:
- `id` int — PRI NOT NULL auto_increment
- `sort` int — NOT NULL
- `name` varchar(255)
- `icon` varchar(255)
- `cross_selling` varchar(64) — NOT NULL
- `upselling` tinyint(1) — NOT NULL
- `count` int — NOT NULL
- `stock_unit_fixed` int — NOT NULL
- `stock_unit_id` int — NOT NULL
- `base_unit_fixed` int — NOT NULL
- `base_unit_id` int
- `stock_base_ratio_fixed` int — NOT NULL
- `stock_base_ratio` decimal(16,8) unsigned — NOT NULL
- `count_denominator_fixed` int — NOT NULL
- `count_denominator` int unsigned
- `order_multiplicity_factor_fixed` int — NOT NULL
- `order_multiplicity_factor` decimal(9,3)
- `order_count_min_fixed` int — NOT NULL
- `order_count_min` decimal(15,3) unsigned
- `order_count_step_fixed` int — NOT NULL
- `order_count_step` decimal(15,3) unsigned
Sample rows: _redacted (live data omitted)_


### `shop_type_codes` (~0 rows)
Columns:
- `type_id` int — PRI NOT NULL
- `code_id` int — PRI NOT NULL
Sample rows: _(empty)_

### `shop_type_features` (~9 rows)
Columns:
- `type_id` int — PRI NOT NULL
- `feature_id` int — PRI NOT NULL
- `sort` int — NOT NULL
Sample rows: _redacted (live data omitted)_


### `shop_type_services` (~0 rows)
Columns:
- `type_id` int — PRI NOT NULL
- `service_id` int — PRI NOT NULL
Sample rows: _(empty)_

### `shop_type_upselling` (~0 rows)
Columns:
- `type_id` int — PRI NOT NULL
- `feature` varchar(32) — PRI NOT NULL
- `feature_id` int
- `cond` varchar(16) — NOT NULL
- `value` varchar(255)
Sample rows: _(empty)_

### `shop_unit` (~20 rows)
Columns:
- `id` int — PRI NOT NULL auto_increment
- `short_name` varchar(255) — NOT NULL
- `name` varchar(255) — NOT NULL
- `name2` varchar(255) — NOT NULL
- `name5` varchar(255) — NOT NULL
- `okei_code` varchar(64) — NOT NULL
- `storefront_name` varchar(255) — NOT NULL
- `sort` int — NOT NULL
- `status` tinyint(1) — NOT NULL
- `builtin` tinyint(1)
Sample rows: _redacted (live data omitted)_


### `shop_usercommerce` (~681 rows)
Columns:
- `id` int — PRI NOT NULL auto_increment
- `user_id` int — MUL NOT NULL
- `comment` text
- `hash` text
- `create_datetime` datetime
Sample rows: _redacted (live data omitted)_


### `shop_usercommerce_products` (~17787 rows)
Columns:
- `id` int — PRI NOT NULL auto_increment
- `commerce_id` int — MUL NOT NULL
- `product_id` int
- `count` int
- `total_price` int
- `total_weight` double
Sample rows: _redacted (live data omitted)_


### `shop_usercontacts` (~41 rows)
Columns:
- `id` int — PRI NOT NULL auto_increment
- `contact_id` int — NOT NULL
- `firstname` varchar(250) — MUL NOT NULL
- `secondname` varchar(250) — NOT NULL
- `job` varchar(200) — NOT NULL
- `phone` varchar(200) — NOT NULL
- `email` varchar(200) — NOT NULL
- `active` tinyint(1)
- `comment` text
Sample rows: _redacted (live data omitted)_


### `shop_userorgs_orgs` (~1543 rows)
Columns:
- `id` int — PRI NOT NULL auto_increment
- `name` varchar(250) — MUL NOT NULL
- `user_id` int — NOT NULL
- `inn` varchar(200) — NOT NULL
- `kpp` varchar(200) — NOT NULL
- `ogrn` varchar(200) — NOT NULL
- `active` double — NOT NULL
- `adress` text
- `type` double
- `comment` text
Sample rows: _redacted (live data omitted)_


### `shop_userorgs_orgs_order` (~34593 rows)
Columns:
- `id` int — PRI NOT NULL auto_increment
- `order_id` varchar(250) — MUL NOT NULL
- `user_id` int — NOT NULL
- `addr_id` int — NOT NULL
- `last_create` datetime — NOT NULL
Sample rows: _redacted (live data omitted)_


### `shop_usershipadreses` (~754 rows)
Columns:
- `id` int — PRI NOT NULL auto_increment
- `city` varchar(250) — MUL NOT NULL
- `country` varchar(50) — NOT NULL
- `region` int — NOT NULL
- `user_id` int — NOT NULL
- `street` varchar(200) — NOT NULL
- `house` varchar(200) — NOT NULL
- `office` varchar(200) — NOT NULL
- `active` double — NOT NULL
- `comment` text
Sample rows: _redacted (live data omitted)_


### `shop_usershipadreses_phones` (~778 rows)
Columns:
- `id` int — PRI NOT NULL auto_increment
- `ship_id` int — MUL NOT NULL
- `user_id` int — NOT NULL
- `phone` varchar(50) — NOT NULL
Sample rows: _redacted (live data omitted)_


### `shop_virtualstock` (~0 rows)
Columns:
- `id` int — PRI NOT NULL auto_increment
- `low_count` int — NOT NULL
- `critical_count` int — NOT NULL
- `sort` int — NOT NULL
- `name` varchar(255)
- `public` int — NOT NULL
Sample rows: _(empty)_

### `shop_virtualstock_stocks` (~0 rows)
Columns:
- `virtualstock_id` int — NOT NULL
- `stock_id` int — NOT NULL
- `sort` int — NOT NULL
Sample rows: _(empty)_

### `shop_yosli_slide` (~3 rows)
Columns:
- `id` int — PRI NOT NULL auto_increment
- `title` text — NOT NULL
- `filename` text — NOT NULL
- `link` text — NOT NULL
- `sort` int — NOT NULL
- `create_datetime` datetime — NOT NULL
- `alt` text — NOT NULL
Sample rows: _redacted (live data omitted)_


### `shop_youcity_cities` (~0 rows)
Columns:
- `id` int — PRI NOT NULL auto_increment
- `city` varchar(255) — NOT NULL
- `region` int — NOT NULL
- `country` varchar(20) — NOT NULL
Sample rows: _(empty)_

## Related non-shop tables

### `exchange_1c_products` (~17974 rows)
Columns:
- `artnumber` varchar(64) — NOT NULL
- `xml_id` varchar(64) — PRI NOT NULL
- `category_xml_id` varchar(64) — PRI NOT NULL
Sample rows: _redacted (live data omitted)_


### `exchange_1c_categories` (~233 rows)
Columns:
- `id` int — PRI NOT NULL auto_increment
- `wa_category_id` int
- `wa_parent_id` int
- `wa_name` varchar(255)
- `1c_xml_id` varchar(64) — MUL NOT NULL
- `1c_parent_xml_id` varchar(64) — NOT NULL
Sample rows: _redacted (live data omitted)_
