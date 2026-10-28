#!/bin/sh
set -eu

# Charge 读写 Finance 供应商账户和扣费流水。账号已存在时不改密码。
USERNAME=${CHARGE_MYSQL_USERNAME:-chat_web_charge_service}
MYSQL_CONTAINER=${CHARGE_MYSQL_CONTAINER:-chat-web-mysql}
RABBIT_CONTAINER=${CHARGE_RABBIT_CONTAINER:-chat-web-rabbitmq}
PASSWORD_FILE=${CHARGE_MYSQL_PASSWORD_FILE:-/opt/chat-web-charge-service/.charge-mysql-password}

docker inspect "$MYSQL_CONTAINER" >/dev/null
docker inspect "$RABBIT_CONTAINER" >/dev/null

mysql_root() {
    docker exec -i "$MYSQL_CONTAINER" sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$@"' sh "$@" 2>&1 | grep -v 'Using a password' || true
}

user_count=$(docker exec "$MYSQL_CONTAINER" sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -N -e "SELECT COUNT(*) FROM mysql.user WHERE user=\"'"$USERNAME"'\" AND host=\"%\""' 2>/dev/null)
if [ "$user_count" = "0" ]; then
    if [ ! -s "$PASSWORD_FILE" ]; then
        umask 077
        mkdir -p "$(dirname "$PASSWORD_FILE")"
        docker run --rm node:22-alpine node -e "process.stdout.write(require('node:crypto').randomBytes(24).toString('base64url'))" > "$PASSWORD_FILE"
        printf '\n' >> "$PASSWORD_FILE"
        chmod 600 "$PASSWORD_FILE"
    fi
    password=$(tr -d '\r\n' < "$PASSWORD_FILE")
    printf "CREATE USER '%s'@'%%' IDENTIFIED BY '%s';\n" "$USERNAME" "$password" | mysql_root
fi
test -s "$PASSWORD_FILE" || { echo "缺少 Charge 数据库密码文件：$PASSWORD_FILE" >&2; exit 1; }
password=$(tr -d '\r\n' < "$PASSWORD_FILE")

sql=$(cat <<SQL
GRANT SELECT, INSERT, UPDATE ON \`chat-web-finance\`.\`tb_finance_srm_user\` TO '$USERNAME'@'%';
GRANT SELECT, INSERT ON \`chat-web-finance\`.\`tb_finance_srm_user_bill\` TO '$USERNAME'@'%';
FLUSH PRIVILEGES;
SQL
)
printf '%s\n' "$sql" | mysql_root

if ! docker exec "$RABBIT_CONTAINER" rabbitmqctl list_users | awk '{print $1}' | grep -qx "$USERNAME"; then
    docker exec "$RABBIT_CONTAINER" rabbitmqctl add_user "$USERNAME" "$password"
else
    docker exec "$RABBIT_CONTAINER" rabbitmqctl change_password "$USERNAME" "$password"
fi
docker exec "$RABBIT_CONTAINER" rabbitmqctl set_permissions -p /chat-sms "$USERNAME" ".*" ".*" ".*"
echo "Charge 已授权供应商账户和扣费流水，并准备 RabbitMQ 账号"
