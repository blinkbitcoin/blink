#!/usr/bin/env bats

load "../../helpers/_common.bash"
load "../../helpers/user.bash"


setup_file() {
  clear_cache

  create_user 'alice'
}


@test "notification-settings: new user has default disabled categories" {
  exec_graphql 'alice' 'user-notification-settings'

  push_enabled="$(graphql_output '.data.me.defaultAccount.notificationSettings.push.enabled')"
  [[ "$push_enabled" == "true" ]] || exit 1

  disabled_categories="$(graphql_output '.data.me.defaultAccount.notificationSettings.push.disabledCategories')"
  n_disabled=$(echo "$disabled_categories" | jq 'length')
  [[ $n_disabled -eq 4 ]] || exit 1

  echo "$disabled_categories" | jq -e 'index("Circles")' || exit 1
  echo "$disabled_categories" | jq -e 'index("AdminNotification")' || exit 1
  echo "$disabled_categories" | jq -e 'index("Marketing")' || exit 1
  echo "$disabled_categories" | jq -e 'index("Price")' || exit 1
}

@test "notification-settings: disable/enable notification channel" {
  token_name='alice'

  variables=$(
      jq -n \
      '{input: { channel: "PUSH" }}')

  exec_graphql "$token_name" 'account-disable-notification-channel' "$variables"
  channel_enabled="$(graphql_output '.data.accountDisableNotificationChannel.account.notificationSettings.push.enabled')"
  [[ "$channel_enabled" == "false" ]] || exit 1

  exec_graphql "$token_name" 'account-enable-notification-channel' "$variables"

  channel_enabled="$(graphql_output '.data.accountEnableNotificationChannel.account.notificationSettings.push.enabled')"
  [[ "$channel_enabled" == "true" ]] || exit 1
}

@test "notification-settings: enable a default-disabled category" {
  token_name='alice'

  variables=$(
      jq -n \
      '{input: { channel: "PUSH", category: "Circles" }}')

  exec_graphql "$token_name" 'account-enable-notification-category' "$variables"
  disabled_categories="$(graphql_output '.data.accountEnableNotificationCategory.account.notificationSettings.push.disabledCategories')"
  n_disabled=$(echo "$disabled_categories" | jq 'length')
  [[ $n_disabled -eq 3 ]] || exit 1
  echo "$disabled_categories" | jq -e 'index("Circles") | not' || exit 1
}

@test "notification-settings: disable an enabled category" {
  token_name='alice'

  variables=$(
      jq -n \
      '{input: { channel: "PUSH", category: "Payments" }}')

  exec_graphql "$token_name" 'account-disable-notification-category' "$variables"
  disabled_categories="$(graphql_output '.data.accountDisableNotificationCategory.account.notificationSettings.push.disabledCategories')"
  n_disabled=$(echo "$disabled_categories" | jq 'length')
  [[ $n_disabled -eq 4 ]] || exit 1
  echo "$disabled_categories" | jq -e 'index("Payments")' || exit 1
}
