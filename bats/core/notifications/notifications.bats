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

@test "notifications: bulletin with label and external url action" {
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
        openExternalUrl: {
          url: "https://example.com/update",
          label: "Learn more"
        },
        icon: "BELL"
      }
    }'
  )

  exec_admin_graphql "$admin_token" 'marketing-notification-trigger' "$variables"

  local action_label
  local action_url
  local icon
  for i in {1..10}; do
    exec_graphql 'alice' 'list-unacknowledged-stateful-notifications-with-bulletin-enabled'
    action_label=$(graphql_output '.data.me.unacknowledgedStatefulNotificationsWithBulletinEnabled.nodes[0].action.label')
    [[ "$action_label" = "Learn more" ]] && break;
    sleep 1
  done
  [[ "$action_label" = "Learn more" ]] || exit 1

  action_url=$(graphql_output '.data.me.unacknowledgedStatefulNotificationsWithBulletinEnabled.nodes[0].action.url')
  [[ "$action_url" = "https://example.com/update" ]] || exit 1

  icon=$(graphql_output '.data.me.unacknowledgedStatefulNotificationsWithBulletinEnabled.nodes[0].icon')
  [[ "$icon" = "BELL" ]] || exit 1
}

@test "notifications: bulletin without label has null action label" {
  admin_token="$(read_value 'admin.token')"

  variables=$(
    jq -n \
    '{
      input: {
        localizedNotificationContents: [
          {
            language: "en",
            title: "Simple notification",
            body: "No label here"
          }
        ],
        shouldSendPush: false,
        shouldAddToHistory: true,
        shouldAddToBulletin: true,
      }
    }'
  )

  exec_admin_graphql "$admin_token" 'marketing-notification-trigger' "$variables"

  local action
  local title
  for i in {1..10}; do
    exec_graphql 'alice' 'list-stateful-notifications' '{"first": 1}'
    title=$(graphql_output '.data.me.statefulNotifications.nodes[0].title')
    [[ "$title" = "Simple notification" ]] && break;
    sleep 1
  done
  [[ "$title" = "Simple notification" ]] || exit 1

  action=$(graphql_output '.data.me.statefulNotifications.nodes[0].action')
  [[ "$action" = "null" ]] || exit 1
}

@test "notifications: bulletin with label and deep link action" {
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
        openDeepLink: {
          screen: "SETTINGS",
          label: "Go to settings"
        }
      }
    }'
  )

  exec_admin_graphql "$admin_token" 'marketing-notification-trigger' "$variables"

  local action_label
  local deep_link
  for i in {1..10}; do
    exec_graphql 'alice' 'list-unacknowledged-stateful-notifications-with-bulletin-enabled'
    action_label=$(graphql_output '.data.me.unacknowledgedStatefulNotificationsWithBulletinEnabled.nodes[0].action.label')
    [[ "$action_label" = "Go to settings" ]] && break;
    sleep 1
  done
  [[ "$action_label" = "Go to settings" ]] || exit 1

  deep_link=$(graphql_output '.data.me.unacknowledgedStatefulNotificationsWithBulletinEnabled.nodes[0].action.deepLink')
  [[ "$deep_link" = "/settings" ]] || exit 1
}

@test "notifications: bulletin with label on both deep link and external url uses deep link" {
  admin_token="$(read_value 'admin.token')"

  variables=$(
    jq -n \
    '{
      input: {
        localizedNotificationContents: [
          {
            language: "en",
            title: "Both actions label",
            body: "Deep link label should take priority"
          }
        ],
        shouldSendPush: false,
        shouldAddToHistory: true,
        shouldAddToBulletin: true,
        openDeepLink: {
          screen: "SETTINGS",
          label: "Deep link label"
        },
        openExternalUrl: {
          url: "https://example.com/fallback",
          label: "External label"
        }
      }
    }'
  )

  exec_admin_graphql "$admin_token" 'marketing-notification-trigger' "$variables"

  local action_label
  local action_url
  for i in {1..10}; do
    exec_graphql 'alice' 'list-unacknowledged-stateful-notifications-with-bulletin-enabled'
    action_label=$(graphql_output '.data.me.unacknowledgedStatefulNotificationsWithBulletinEnabled.nodes[0].action.label')
    [[ "$action_label" = "External label" ]] && break;
    sleep 1
  done
  [[ "$action_label" = "External label" ]] || exit 1

  action_url=$(graphql_output '.data.me.unacknowledgedStatefulNotificationsWithBulletinEnabled.nodes[0].action.url')
  [[ "$action_url" = "https://example.com/fallback" ]] || exit 1
}

trigger_bulletin() {
  local token_name=$1
  local title=$2
  local bulletin_key=$3
  local dismissible=${4:-true}

  variables=$(
    jq -n \
    --arg userId "$(read_value "$token_name.user_id")" \
    --arg title "$title" \
    --arg bulletinKey "$bulletin_key" \
    --argjson dismissible "$dismissible" \
    '{
      input: ({
        userIdsFilter: [$userId],
        localizedNotificationContents: [
          {
            language: "en",
            title: $title,
            body: "bulletin body"
          }
        ],
        shouldSendPush: false,
        shouldAddToHistory: true,
        shouldAddToBulletin: true,
        dismissible: $dismissible
      } + (if $bulletinKey == "" then {} else {bulletinKey: $bulletinKey} end))
    }'
  )
  exec_admin_graphql "$(read_value 'admin.token')" 'marketing-notification-trigger' "$variables"
}

close_bulletin() {
  local token_name=$1
  local bulletin_key=$2

  variables=$(
    jq -n \
    --arg userId "$(read_value "$token_name.user_id")" \
    --arg bulletinKey "$bulletin_key" \
    '{input: {userId: $userId, bulletinKey: $bulletinKey}}'
  )
  exec_admin_graphql "$(read_value 'admin.token')" 'notification-bulletin-close' "$variables"
}

list_bulletins() {
  exec_graphql "$1" 'list-unacknowledged-stateful-notifications-with-bulletin-enabled' '{"first": 100}'
}

bulletins_output() {
  graphql_output ".data.me.unacknowledgedStatefulNotificationsWithBulletinEnabled.nodes$1"
}

list_history() {
  exec_graphql "$1" 'list-stateful-notifications' '{"first": 100}'
}

history_output() {
  graphql_output ".data.me.statefulNotifications.nodes$1"
}

acknowledge_notification() {
  variables=$(jq -n --arg id "$2" '{input: {notificationId: $id}}')
  exec_graphql "$1" 'acknowledge-notification' "$variables"
}

bulletin_with_title_is_listed() {
  list_bulletins "$1"
  [[ "$(bulletins_output " | map(select(.title == \"$2\")) | length")" = "1" ]] || exit 1
}

@test "notifications: setup bulletin user" {
  create_user 'bulletin_user'
  list_bulletins 'bulletin_user'
  cache_value 'bulletin_user.user_id' "$(graphql_output '.data.me.id')"
}

@test "notifications: bulletin with same key replaces the active one" {
  trigger_bulletin 'bulletin_user' 'Keyed first' 'feature-rollout'
  [[ "$(graphql_output '.data.marketingNotificationTrigger.success')" = "true" ]] || exit 1
  retry 10 1 bulletin_with_title_is_listed 'bulletin_user' 'Keyed first'

  trigger_bulletin 'bulletin_user' 'Keyed second' 'feature-rollout'
  [[ "$(graphql_output '.data.marketingNotificationTrigger.success')" = "true" ]] || exit 1
  retry 10 1 bulletin_with_title_is_listed 'bulletin_user' 'Keyed second'

  list_bulletins 'bulletin_user'
  keyed=' | map(select(.bulletinKey == "feature-rollout"))'
  [[ "$(bulletins_output "$keyed | length")" = "1" ]] || exit 1
  [[ "$(bulletins_output "$keyed | .[0].title")" = "Keyed second" ]] || exit 1

  acknowledge_notification 'bulletin_user' "$(bulletins_output "$keyed | .[0].id")"
  list_bulletins 'bulletin_user'
  [[ "$(bulletins_output "$keyed | length")" = "0" ]] || exit 1

  list_history 'bulletin_user'
  replaced_acknowledged_at="$(history_output ' | map(select(.title == "Keyed first")) | .[0].acknowledgedAt')"
  is_number "$replaced_acknowledged_at"
}

history_has_titles_starting_with() {
  local count
  list_history "$1"
  count="$(history_output " | map(select(.title | startswith(\"$2\"))) | length")"
  [[ "$count" = "$3" ]] || exit 1
}

@test "notifications: concurrent bulletins with same key leave only one active" {
  for i in {1..5}; do
    trigger_bulletin 'bulletin_user' "Concurrent $i" 'concurrent-key' &
  done
  wait
  retry 20 1 history_has_titles_starting_with 'bulletin_user' 'Concurrent' 5

  list_bulletins 'bulletin_user'
  [[ "$(bulletins_output ' | map(select(.bulletinKey == "concurrent-key")) | length')" = "1" ]] || exit 1
  list_history 'bulletin_user'
  acknowledged_count="$(history_output ' | map(select((.title | startswith("Concurrent")) and .acknowledgedAt != null)) | length')"
  [[ "$acknowledged_count" = "4" ]] || exit 1
}

@test "notifications: bulletins without key stack and are dismissible by default" {
  trigger_bulletin 'bulletin_user' 'Unkeyed first' ''
  trigger_bulletin 'bulletin_user' 'Unkeyed second' ''
  retry 10 1 bulletin_with_title_is_listed 'bulletin_user' 'Unkeyed first'
  retry 10 1 bulletin_with_title_is_listed 'bulletin_user' 'Unkeyed second'

  list_bulletins 'bulletin_user'
  unkeyed=' | map(select(.title | startswith("Unkeyed")))'
  [[ "$(bulletins_output "$unkeyed | length")" = "2" ]] || exit 1
  [[ "$(bulletins_output "$unkeyed | map(.bulletinKey == null) | all")" = "true" ]] || exit 1
  [[ "$(bulletins_output "$unkeyed | map(.dismissible) | all")" = "true" ]] || exit 1
}

@test "notifications: user can acknowledge a non dismissible bulletin" {
  trigger_bulletin 'bulletin_user' 'Non dismissible' 'pending-action' false
  retry 10 1 bulletin_with_title_is_listed 'bulletin_user' 'Non dismissible'

  list_bulletins 'bulletin_user'
  bulletin=' | map(select(.title == "Non dismissible")) | .[0]'
  [[ "$(bulletins_output "$bulletin.dismissible")" = "false" ]] || exit 1
  [[ "$(bulletins_output "$bulletin.bulletinKey")" = "pending-action" ]] || exit 1

  acknowledge_notification 'bulletin_user' "$(bulletins_output "$bulletin.id")"
  [[ "$(graphql_output '.data.statefulNotificationAcknowledge.notification.acknowledgedAt')" != "null" ]] || exit 1

  list_bulletins 'bulletin_user'
  [[ "$(bulletins_output ' | map(select(.title == "Non dismissible")) | length')" = "0" ]] || exit 1
}

@test "notifications: admin closes the active bulletin by key" {
  trigger_bulletin 'bulletin_user' 'Closed by admin' 'admin-closed' false
  retry 10 1 bulletin_with_title_is_listed 'bulletin_user' 'Closed by admin'

  close_bulletin 'bulletin_user' ' Admin-Closed '
  [[ "$(graphql_output '.data.notificationBulletinClose.success')" = "true" ]] || exit 1
  [[ "$(graphql_output '.data.notificationBulletinClose.errors | length')" = "0" ]] || exit 1

  list_bulletins 'bulletin_user'
  [[ "$(bulletins_output ' | map(select(.bulletinKey == "admin-closed")) | length')" = "0" ]] || exit 1

  list_history 'bulletin_user'
  closed_acknowledged_at="$(history_output ' | map(select(.title == "Closed by admin")) | .[0].acknowledgedAt')"
  is_number "$closed_acknowledged_at"
}

@test "notifications: admin close without active bulletin succeeds" {
  close_bulletin 'bulletin_user' 'admin-closed'
  [[ "$(graphql_output '.data.notificationBulletinClose.success')" = "true" ]] || exit 1

  close_bulletin 'bulletin_user' 'never-sent'
  [[ "$(graphql_output '.data.notificationBulletinClose.success')" = "true" ]] || exit 1
}

@test "notifications: admin close does not affect other keys or unkeyed bulletins" {
  trigger_bulletin 'bulletin_user' 'Key one' 'key-one'
  trigger_bulletin 'bulletin_user' 'Key two' 'key-two'
  trigger_bulletin 'bulletin_user' 'Unkeyed untouched' ''
  retry 10 1 bulletin_with_title_is_listed 'bulletin_user' 'Key one'
  retry 10 1 bulletin_with_title_is_listed 'bulletin_user' 'Key two'
  retry 10 1 bulletin_with_title_is_listed 'bulletin_user' 'Unkeyed untouched'

  close_bulletin 'bulletin_user' 'key-one'
  [[ "$(graphql_output '.data.notificationBulletinClose.success')" = "true" ]] || exit 1

  list_bulletins 'bulletin_user'
  [[ "$(bulletins_output ' | map(select(.bulletinKey == "key-one")) | length')" = "0" ]] || exit 1
  [[ "$(bulletins_output ' | map(select(.bulletinKey == "key-two")) | length')" = "1" ]] || exit 1
  [[ "$(bulletins_output ' | map(select(.title == "Unkeyed untouched")) | length')" = "1" ]] || exit 1
}

@test "notifications: bulletin with key does not affect other users" {
  create_user 'bulletin_other_user'
  list_bulletins 'bulletin_other_user'
  cache_value 'bulletin_other_user.user_id' "$(graphql_output '.data.me.id')"

  trigger_bulletin 'bulletin_user' 'Shared key own user' 'shared-key'
  retry 10 1 bulletin_with_title_is_listed 'bulletin_user' 'Shared key own user'

  trigger_bulletin 'bulletin_other_user' 'Shared key other user' 'shared-key'
  retry 10 1 bulletin_with_title_is_listed 'bulletin_other_user' 'Shared key other user'

  list_bulletins 'bulletin_user'
  [[ "$(bulletins_output ' | map(select(.bulletinKey == "shared-key")) | length')" = "1" ]] || exit 1
  [[ "$(bulletins_output ' | map(select(.bulletinKey == "shared-key")) | .[0].title')" = "Shared key own user" ]] || exit 1
}

@test "notifications: bulletin options require bulletin" {
  variables=$(
    jq -n \
    --arg userId "$(read_value 'bulletin_user.user_id')" \
    '{
      input: {
        userIdsFilter: [$userId],
        localizedNotificationContents: [
          {
            language: "en",
            title: "Not a bulletin",
            body: "history only"
          }
        ],
        shouldSendPush: false,
        shouldAddToHistory: true,
        shouldAddToBulletin: false,
        bulletinKey: "feature-rollout"
      }
    }'
  )
  exec_admin_graphql "$(read_value 'admin.token')" 'marketing-notification-trigger' "$variables"
  [[ "$(graphql_output '.data.marketingNotificationTrigger.success')" = "false" ]] || exit 1
  [[ "$(graphql_output '.data.marketingNotificationTrigger.errors | length')" = "1" ]] || exit 1
}

@test "notifications: invalid bulletin key is rejected" {
  trigger_bulletin 'bulletin_user' 'Invalid key' 'invalid key!'
  [[ "$(graphql_output '.data.marketingNotificationTrigger.success')" = "false" ]] || exit 1
  [[ "$(graphql_output '.data.marketingNotificationTrigger.errors[0].message')" = "Invalid value for BulletinKey" ]] || exit 1

  close_bulletin 'bulletin_user' 'invalid key!'
  [[ "$(graphql_output '.data.notificationBulletinClose.success')" = "false" ]] || exit 1
}

query_bulletins() {
  local bulletin_key=$1
  shift
  variables=$(
    jq -n \
    --arg bulletinKey "$bulletin_key" \
    '{bulletinKey: $bulletinKey, userIds: $ARGS.positional}' \
    --args "$@"
  )
  exec_admin_graphql "$(read_value 'admin.token')" 'notification-bulletins' "$variables"
}

create_bulletin_user() {
  create_user "$1"
  list_bulletins "$1"
  cache_value "$1.user_id" "$(graphql_output '.data.me.id')"
}

@test "notifications: admin lists latest bulletin per user with its state" {
  create_bulletin_user 'bulletin_state_user'
  create_bulletin_user 'bulletin_closed_user'
  create_bulletin_user 'bulletin_empty_user'
  state_user_id="$(read_value 'bulletin_state_user.user_id')"
  closed_user_id="$(read_value 'bulletin_closed_user.user_id')"
  empty_user_id="$(read_value 'bulletin_empty_user.user_id')"

  trigger_bulletin 'bulletin_state_user' 'State first' 'state-key'
  retry 10 1 bulletin_with_title_is_listed 'bulletin_state_user' 'State first'
  trigger_bulletin 'bulletin_state_user' 'State second' 'state-key'
  retry 10 1 bulletin_with_title_is_listed 'bulletin_state_user' 'State second'
  list_bulletins 'bulletin_state_user'
  latest_id="$(bulletins_output ' | map(select(.title == "State second")) | .[0].id')"

  trigger_bulletin 'bulletin_closed_user' 'State closed' 'state-key'
  retry 10 1 bulletin_with_title_is_listed 'bulletin_closed_user' 'State closed'
  close_bulletin 'bulletin_closed_user' 'state-key'
  [[ "$(graphql_output '.data.notificationBulletinClose.success')" = "true" ]] || exit 1

  query_bulletins 'state-key' "$state_user_id" "$closed_user_id" "$empty_user_id" "$(random_uuid)"
  [[ "$(graphql_output '.errors')" = "null" ]] || exit 1
  [[ "$(graphql_output '.data.notificationBulletins | length')" = "2" ]] || exit 1

  state_bulletin=".data.notificationBulletins | map(select(.userId == \"$state_user_id\")) | .[0]"
  [[ "$(graphql_output "$state_bulletin.id")" = "$latest_id" ]] || exit 1
  [[ "$(graphql_output "$state_bulletin.acknowledgedAt")" = "null" ]] || exit 1
  is_number "$(graphql_output "$state_bulletin.createdAt")"

  closed_bulletin=".data.notificationBulletins | map(select(.userId == \"$closed_user_id\")) | .[0]"
  is_number "$(graphql_output "$closed_bulletin.acknowledgedAt")"
}

@test "notifications: admin bulletin listing ignores duplicated user ids" {
  state_user_id="$(read_value 'bulletin_state_user.user_id')"
  query_bulletins 'state-key' "$state_user_id" "$state_user_id"
  [[ "$(graphql_output '.errors')" = "null" ]] || exit 1
  [[ "$(graphql_output '.data.notificationBulletins | length')" = "1" ]] || exit 1
}

@test "notifications: admin lists no bulletins for a key never sent" {
  query_bulletins 'never-sent-key' "$(read_value 'bulletin_state_user.user_id')"
  [[ "$(graphql_output '.errors')" = "null" ]] || exit 1
  [[ "$(graphql_output '.data.notificationBulletins | length')" = "0" ]] || exit 1
}

@test "notifications: admin bulletin listing enforces the user ids limit" {
  user_ids=()
  for i in {1..101}; do
    user_ids+=("$(random_uuid)")
  done

  query_bulletins 'state-key' "${user_ids[@]:0:100}"
  [[ "$(graphql_output '.errors')" = "null" ]] || exit 1

  query_bulletins 'state-key' "${user_ids[@]}"
  [[ "$(graphql_output '.errors | length')" = "1" ]] || exit 1
  [[ "$(graphql_output '.data')" = "null" ]] || exit 1
}

@test "notifications: admin close for unknown user fails" {
  variables=$(
    jq -n \
    --arg userId "$(random_uuid)" \
    '{input: {userId: $userId, bulletinKey: "state-key"}}'
  )
  exec_admin_graphql "$(read_value 'admin.token')" 'notification-bulletin-close' "$variables"
  [[ "$(graphql_output '.data.notificationBulletinClose.success')" = "false" ]] || exit 1
  [[ "$(graphql_output '.data.notificationBulletinClose.errors | length')" = "1" ]] || exit 1
}
