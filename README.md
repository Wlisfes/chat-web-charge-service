# chat-web-charge-service

R 端供应商扣费服务。设备提交或发送成功时扣费一次，余额通过 Redis `HINCRBY` 原子扣减，并写入 MySQL 扣费流水。后付可以扣成负数；发送前余额校验由 Dispatch 直接读取 Redis。充值尚未实现。

| 项目          | 生产（Docker）                                         | 本地开发                                   |
| ------------- | ------------------------------------------------------ | ------------------------------------------ |
| HTTP 端口     | `5120`                                                 | `5122`                                     |
| Nacos Data ID | `chat-web-charge-service.yaml`                         | `chat-web-charge-service-development.yaml` |
| 数据库        | `database.chat-web-finance`                            | 同左                                       |
| Redis         | Finance Redis index `3`，共享供应商钱包哈希            | 同左                                       |
| RabbitMQ      | 虚拟主机 `/chat-sms`，消费 `chat.sms.billing.srm.user` | 同左                                       |
