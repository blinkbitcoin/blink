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

@test "notifications: bulletin with button and external url action" {
  admin_token="$(read_value 'admin.token')"

  variables=$(
    jq -n \
    '{
      input: {
        localizedNotificationContents: [
          {
            language: "en",
            title: "New feature available",
            body: "Check out our latest update"
          }
        ],
        shouldSendPush: false,
        shouldAddToHistory: true,
        shouldAddToBulletin: true,
        bulletinButton: {
          label: "Learn more"
        },
        openExternalUrl: {
          url: "https://example.com/update"
        },
        icon: "BELL"
      }
    }'
  )

  exec_admin_graphql "$admin_token" 'marketing-notification-trigger' "$variables"

  local button_label
  local action_url
  local icon
  for i in {1..10}; do
    exec_graphql 'alice' 'list-unacknowledged-stateful-notifications-with-bulletin-enabled'
    button_label=$(graphql_output '.data.me.unacknowledgedStatefulNotificationsWithBulletinEnabled.nodes[0].bulletinButton.label')
    [[ "$button_label" = "Learn more" ]] && break;
    sleep 1
  done
  [[ "$button_label" = "Learn more" ]] || exit 1

  action_url=$(graphql_output '.data.me.unacknowledgedStatefulNotificationsWithBulletinEnabled.nodes[0].action.url')
  [[ "$action_url" = "https://example.com/update" ]] || exit 1

  icon=$(graphql_output '.data.me.unacknowledgedStatefulNotificationsWithBulletinEnabled.nodes[0].icon')
  [[ "$icon" = "BELL" ]] || exit 1
}

@test "notifications: bulletin without button has null bulletinButton" {
  admin_token="$(read_value 'admin.token')"

  variables=$(
    jq -n \
    '{
      input: {
        localizedNotificationContents: [
          {
            language: "en",
            title: "Simple notification",
            body: "No button here"
          }
        ],
        shouldSendPush: false,
        shouldAddToHistory: true,
        shouldAddToBulletin: true,
      }
    }'
  )

  exec_admin_graphql "$admin_token" 'marketing-notification-trigger' "$variables"

  local button
  local title
  for i in {1..10}; do
    exec_graphql 'alice' 'list-stateful-notifications' '{"first": 1}'
    title=$(graphql_output '.data.me.statefulNotifications.nodes[0].title')
    [[ "$title" = "Simple notification" ]] && break;
    sleep 1
  done
  [[ "$title" = "Simple notification" ]] || exit 1

  button=$(graphql_output '.data.me.statefulNotifications.nodes[0].bulletinButton')
  [[ "$button" = "null" ]] || exit 1
}

@test "notifications: bulletin with button and deep link action" {
  admin_token="$(read_value 'admin.token')"

  variables=$(
    jq -n \
    '{
      input: {
        localizedNotificationContents: [
          {
            language: "en",
            title: "Complete your profile",
            body: "Set up your account to get started"
          }
        ],
        shouldSendPush: false,
        shouldAddToHistory: true,
        shouldAddToBulletin: true,
        bulletinButton: {
          label: "Go to settings"
        },
        openDeepLink: {
          screen: "SETTINGS"
        }
      }
    }'
  )

  exec_admin_graphql "$admin_token" 'marketing-notification-trigger' "$variables"

  local button_label
  local deep_link
  for i in {1..10}; do
    exec_graphql 'alice' 'list-unacknowledged-stateful-notifications-with-bulletin-enabled'
    button_label=$(graphql_output '.data.me.unacknowledgedStatefulNotificationsWithBulletinEnabled.nodes[0].bulletinButton.label')
    [[ "$button_label" = "Go to settings" ]] && break;
    sleep 1
  done
  [[ "$button_label" = "Go to settings" ]] || exit 1

  deep_link=$(graphql_output '.data.me.unacknowledgedStatefulNotificationsWithBulletinEnabled.nodes[0].action.deepLink')
  [[ "$deep_link" = "/settings" ]] || exit 1
}
