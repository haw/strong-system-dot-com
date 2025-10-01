FROM mysql:8.4.5

# Set environment variables
ENV MYSQL_ROOT_PASSWORD=password
ENV MYSQL_DATABASE=employee_db
ENV MYSQL_USER=user
ENV MYSQL_PASSWORD=password

# Set character set and collation
ENV MYSQL_CHARSET=utf8mb4
ENV MYSQL_COLLATION=utf8mb4_unicode_ci

# Copy initialization scripts
COPY ./init.sql /docker-entrypoint-initdb.d/

# Copy custom MySQL configuration
COPY ./my.cnf /etc/mysql/conf.d/

# Expose port
EXPOSE 3306