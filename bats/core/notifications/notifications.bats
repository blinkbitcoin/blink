#!/usr/bin/env bats

load "../../helpers/_common.bash"
load "../../helpers/user.bash"
load "../../helpers/admin.bash"

setup_file() {
  clear_cache

  create_user 'alice'

  login_admin
}

@test "notifications: list stateful notifications" {
  admin_token="$(read_value 'admin.token')"

  variables=$(
    jq -n \
    '{
      input: {
        localizedNotificationContents: [
          {
            language: "en",
            title: "Test title",
            body: "test body"
          }
        ],
        shouldSendPush: false,
        shouldAddToHistory: true,
        shouldAddToBulletin: true,
      }
    }'
  )

  # trigger a marketing notification
  exec_admin_graphql "$admin_token" 'marketing-notification-trigger' "$variables"

  local n_notifications
  for i in {1..10}; do
    exec_graphql 'alice' 'list-stateful-notifications'
    n_notifications=$(graphql_output '.data.me.statefulNotifications.nodes | length')
    [[ $n_notifications -eq 1 ]] && break;
    sleep 1
  done
  [[ $n_notifications -eq 1 ]] || exit 1;

  exec_admin_graphql "$admin_token" 'marketing-notification-trigger' "$variables"

  for i in {1..10}; do
    exec_graphql 'alice' 'list-stateful-notifications'
    n_notifications=$(graphql_output '.data.me.statefulNotifications.nodes | length')
    [[ $n_notifications -eq 2 ]] && break;
      sleep 1
  done
  [[ $n_notifications -eq 2 ]] || exit 1;
}

@test "notifications: list stateful notifications paginated with cursor" {
  exec_graphql 'alice' 'list-stateful-notifications' '{"first": 1}'
  n_notifications=$(graphql_output '.data.me.statefulNotifications.nodes | length')
  first_id=$(graphql_output '.data.me.statefulNotifications.nodes[0].id')
  cursor=$(graphql_output '.data.me.statefulNotifications.pageInfo.endCursor')
  next_page=$(graphql_output '.data.me.statefulNotifications.pageInfo.hasNextPage')
  [[ $n_notifications -eq 1 ]] || exit 1
  [[ "$next_page" = "true" ]] || exit 1

  variables=$(
    jq -n \
    --arg after "${cursor}" \
    '{first: 1, after: $after}'
  )
  exec_graphql 'alice' 'list-stateful-notifications' "$variables"
  n_notifications=$(graphql_output '.data.me.statefulNotifications.nodes | length')
  second_id=$(graphql_output '.data.me.statefulNotifications.nodes[0].id')
  next_page=$(graphql_output '.data.me.statefulNotifications.pageInfo.hasNextPage')
  [[ $n_notifications -eq 1 ]] || exit 1
  [[ "${first_id}" != "${second_id}" ]] || exit 1
  [[ "$next_page" = "false" ]] || exit 1
}

@test "notifications: acknowledge stateful notification" {
  exec_graphql 'alice' 'list-stateful-notifications' '{"first": 1}'
  n_notifications=$(graphql_output '.data.me.statefulNotifications.nodes | length')
  id=$(graphql_output '.data.me.statefulNotifications.nodes[0].id')
  acknowledged_at=$(graphql_output '.data.me.statefulNotifications.nodes[0].acknowledgedAt')
  [[ "$acknowledged_at" = "null" ]] || exit 1

  variables=$(
    jq -n \
    --arg id "${id}" \
    '{input: {notificationId: $id}}'
  )
  exec_graphql 'alice' 'acknowledge-notification' "$variables"
  acknowledged_at=$(graphql_output '.data.statefulNotificationAcknowledge.notification.acknowledgedAt')
  [[ "$acknowledged_at" != "null" ]] || exit 1
}

@test "notifications: list unacknowledged stateful notifications with bulletin enabled" {
  local n_notifications
  exec_graphql 'alice' 'list-unacknowledged-stateful-notifications-with-bulletin-enabled'
  n_notifications=$(graphql_output '.data.me.unacknowledgedStatefulNotificationsWithBulletinEnabled.nodes | length')
  [[ $n_bulletins -eq 0 ]] || exit 1

  admin_token="$(read_value 'admin.token')"

  variables=$(
    jq -n \
    '{
      input: {
        localizedNotificationContents: [
          {
            language: "en",
            title: "Test title",
            body: "test body"
          }
        ],
        shouldSendPush: false,
        shouldAddToHistory: true,
        shouldAddToBulletin: true,
      }
    }'
  )

  # trigger two marketing notification
  exec_admin_graphql "$admin_token" 'marketing-notification-trigger' "$variables"
  exec_admin_graphql "$admin_token" 'marketing-notification-trigger' "$variables"

  for i in {1..10}; do
    exec_graphql 'alice' 'list-unacknowledged-stateful-notifications-with-bulletin-enabled'
    n_notifications=$(graphql_output '.data.me.unacknowledgedStatefulNotificationsWithBulletinEnabled.nodes | length')
    [[ $n_notifications -eq 2 ]] && break;
    sleep 1
  done
  [[ $n_notifications -eq 2 ]] || exit 1;
}

@test "notifications: list unacknowledged stateful notifications with bulletin enabled paginated with cursor" {
  exec_graphql 'alice' 'list-unacknowledged-stateful-notifications-with-bulletin-enabled' '{"first": 1}'
  n_notifications=$(graphql_output '.data.me.unacknowledgedStatefulNotificationsWithBulletinEnabled.nodes | length')
  first_id=$(graphql_output '.data.me.unacknowledgedStatefulNotificationsWithBulletinEnabled.nodes[0].id')
  cursor=$(graphql_output '.data.me.unacknowledgedStatefulNotificationsWithBulletinEnabled.pageInfo.endCursor')
  next_page=$(graphql_output '.data.me.unacknowledgedStatefulNotificationsWithBulletinEnabled.pageInfo.hasNextPage')
  [[ $n_notifications -eq 1 ]] || exit 1
  [[ "$next_page" = "true" ]] || exit 1

  variables=$(
    jq -n \
    --arg after "${cursor}" \
    '{first: 1, after: $after}'
  )
  exec_graphql 'alice' 'list-unacknowledged-stateful-notifications-with-bulletin-enabled' "$variables"
  n_notifications=$(graphql_output '.data.me.unacknowledgedStatefulNotificationsWithBulletinEnabled.nodes | length')
  second_id=$(graphql_output '.data.me.unacknowledgedStatefulNotificationsWithBulletinEnabled.nodes[0].id')
  cursor=$(graphql_output '.data.me.unacknowledgedStatefulNotificationsWithBulletinEnabled.pageInfo.endCursor')
  next_page=$(graphql_output '.data.me.unacknowledgedStatefulNotificationsWithBulletinEnabled.pageInfo.hasNextPage')
  [[ $n_notifications -eq 1 ]] || exit 1
  [[ "${first_id}" != "${second_id}" ]] || exit 1
  [[ "$next_page" = "true" ]] || exit 1

  variables=$(
    jq -n \
    --arg after "${cursor}" \
    '{first: 1, after: $after}'
  )
  exec_graphql 'alice' 'list-unacknowledged-stateful-notifications-with-bulletin-enabled' "$variables"
  n_notifications=$(graphql_output '.data.me.unacknowledgedStatefulNotificationsWithBulletinEnabled.nodes | length')
  third_id=$(graphql_output '.data.me.unacknowledgedStatefulNotificationsWithBulletinEnabled.nodes[0].id')
  next_page=$(graphql_output '.data.me.unacknowledgedStatefulNotificationsWithBulletinEnabled.pageInfo.hasNextPage')
  [[ $n_notifications -eq 1 ]] || exit 1
  [[ "${second_id}" != "${third_id}" ]] || exit 1
  [[ "$next_page" = "false" ]] || exit 1
}

@test "notifications: list stateful notifications without bulletin enabled" {
  local n_notifications
  exec_graphql 'alice' 'list-stateful-notifications-without-bulletin-enabled'
  n_notifications=$(graphql_output '.data.me.listStatefulNotificationsWithoutBulletinEnabled.nodes | length')
  [[ $n_bulletins -eq 0 ]] || exit 1

  admin_token="$(read_value 'admin.token')"

  variables=$(
    jq -n \
    '{
      input: {
        localizedNotificationContents: [
          {
            language: "en",
            title: "Test title",
            body: "test body"
          }
        ],
        shouldSendPush: false,
        shouldAddToHistory: true,
        shouldAddToBulletin: false,
      }
    }'
  )

  # trigger two marketing notification
  exec_admin_graphql "$admin_token" 'marketing-notification-trigger' "$variables"
  exec_admin_graphql "$admin_token" 'marketing-notification-trigger' "$variables"

  for i in {1..10}; do
    exec_graphql 'alice' 'list-stateful-notifications-without-bulletin-enabled' '{"first": 100}'
    n_notifications=$(graphql_output '.data.me.statefulNotificationsWithoutBulletinEnabled.nodes | length')
    [[ $n_notifications -eq 2 ]] && break;
    sleep 1
  done
  [[ $n_notifications -eq 2 ]] || exit 1;
}

@test "notifications: list stateful notifications without bulletin enabled paginated with cursor" {
  exec_graphql 'alice' 'list-stateful-notifications-without-bulletin-enabled' '{"first": 1}'
  n_notifications=$(graphql_output '.data.me.statefulNotificationsWithoutBulletinEnabled.nodes | length')
  first_id=$(graphql_output '.data.me.statefulNotificationsWithoutBulletinEnabled.nodes[0].id')
  cursor=$(graphql_output '.data.me.statefulNotificationsWithoutBulletinEnabled.pageInfo.endCursor')
  next_page=$(graphql_output '.data.me.statefulNotificationsWithoutBulletinEnabled.pageInfo.hasNextPage')
  [[ $n_notifications -eq 1 ]] || exit 1
  [[ "$next_page" = "true" ]] || exit 1

  variables=$(
    jq -n \
    --arg after "${cursor}" \
    '{first: 1, after: $after}'
  )
  exec_graphql 'alice' 'list-stateful-notifications-without-bulletin-enabled' "$variables"
  n_notifications=$(graphql_output '.data.me.statefulNotificationsWithoutBulletinEnabled.nodes | length')
  second_id=$(graphql_output '.data.me.statefulNotificationsWithoutBulletinEnabled.nodes[0].id')
  next_page=$(graphql_output '.data.me.statefulNotificationsWithoutBulletinEnabled.pageInfo.hasNextPage')
  [[ $n_notifications -eq 1 ]] || exit 1
  [[ "${first_id}" != "${second_id}" ]] || exit 1
  [[ "$next_page" = "false" ]] || exit 1
}

@test "notifications: unacknowledged stateful notifications without bulletin enabled count" {
  exec_graphql 'alice' 'unacknowledged-stateful-notifications-without-bulletin-enabled-count'
  count=$(graphql_output '.data.me.unacknowledgedStatefulNotificationsWithoutBulletinEnabledCount')
  [[ $count -eq 2 ]] || exit 1
}

@test "notifications: default notification settings have non-payment categories disabled" {
  # Create a fresh user to verify default notification settings
  create_user 'bob'

  exec_graphql 'bob' 'user-notification-settings'
  disabled_categories=$(graphql_output '.data.me.notificationSettings.push.disabledCategories')
  push_enabled=$(graphql_output '.data.me.notificationSettings.push.enabled')

  # Push notifications should be enabled by default
  [[ "$push_enabled" = "true" ]] || exit 1

  # Circles, AdminNotification, Marketing, and Price should be disabled by default
  n_disabled=$(echo "$disabled_categories" | jq 'length')
  [[ $n_disabled -eq 4 ]] || exit 1

  echo "$disabled_categories" | jq -e 'index("Circles")' || exit 1
  echo "$disabled_categories" | jq -e 'index("AdminNotification")' || exit 1
  echo "$disabled_categories" | jq -e 'index("Marketing")' || exit 1
  echo "$disabled_categories" | jq -e 'index("Price")' || exit 1
}

@test "notifications: enable a default-disabled category" {
  variables=$(
    jq -n \
    '{input: {channel: "PUSH", category: "Marketing"}}'
  )
  exec_graphql 'bob' 'account-enable-notification-category' "$variables"
  disabled_categories=$(graphql_output '.data.accountEnableNotificationCategory.account.notificationSettings.push.disabledCategories')

  # Marketing should no longer be in disabled list
  n_disabled=$(echo "$disabled_categories" | jq 'length')
  [[ $n_disabled -eq 3 ]] || exit 1
  echo "$disabled_categories" | jq -e 'index("Marketing")' && exit 1 || true
}

@test "notifications: disable an enabled category" {
  variables=$(
    jq -n \
    '{input: {channel: "PUSH", category: "Payments"}}'
  )
  exec_graphql 'bob' 'account-disable-notification-category' "$variables"
  disabled_categories=$(graphql_output '.data.accountDisableNotificationCategory.account.notificationSettings.push.disabledCategories')

  # Payments should now be in disabled list, Marketing still enabled (from previous test)
  n_disabled=$(echo "$disabled_categories" | jq 'length')
  [[ $n_disabled -eq 4 ]] || exit 1
  echo "$disabled_categories" | jq -e 'index("Payments")' || exit 1
  echo "$disabled_categories" | jq -e 'index("Marketing")' && exit 1 || true
}
