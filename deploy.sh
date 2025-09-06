#!/usr/bin/expect -f

set timeout 30
spawn ssh root@144.31.165.36

expect "password:"
send "HTZhvgJPd55L\r"

expect "#"
send "cd /var/www/telegram-catalog\r"

expect "#"
send "git pull origin main\r"

expect "#"
send "npm install\r"

expect "#"
send "pm2 restart telegram-catalog\r"

expect "#"
send "pm2 status\r"

expect "#"
send "exit\r"

interact