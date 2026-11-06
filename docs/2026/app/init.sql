-- Day 2 hands-on: initial data for the local MySQL container on EC2.
-- Employees are the same as containers/db-server/init.sql.
SET NAMES utf8mb4;
CREATE DATABASE IF NOT EXISTS employee_db
    DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE employee_db;

CREATE TABLE IF NOT EXISTS employees (
    id INT AUTO_INCREMENT PRIMARY KEY,
    employee_id VARCHAR(20) NOT NULL UNIQUE,
    last_name VARCHAR(50) NOT NULL,
    first_name VARCHAR(50) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    department VARCHAR(50) NOT NULL,
    position VARCHAR(50),
    hire_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO employees (employee_id, last_name, first_name, email, department, position, hire_date)
VALUES
    ('E001', '山田', '太郎', 'taro.yamada@strongsystem.com', '開発部', '主任', '2015-04-01'),
    ('E002', '鈴木', '花子', 'hanako.suzuki@strongsystem.com', '営業部', '課長', '2010-04-01'),
    ('E003', '佐藤', '一郎', 'ichiro.sato@strongsystem.com', '管理部', '部長', '2005-04-01'),
    ('E004', '田中', '恵子', 'keiko.tanaka@strongsystem.com', '人事部', '主任', '2018-04-01'),
    ('E005', '伊藤', '健太', 'kenta.ito@strongsystem.com', '開発部', '社員', '2020-04-01'),
    ('E006', '高橋', '美咲', 'misaki.takahashi@strongsystem.com', '営業部', '社員', '2019-04-01'),
    ('E007', '渡辺', '雄介', 'yusuke.watanabe@strongsystem.com', '開発部', '課長', '2012-04-01'),
    ('E008', '小林', '由美', 'yumi.kobayashi@strongsystem.com', '人事部', '社員', '2021-04-01'),
    ('E009', '加藤', '大輔', 'daisuke.kato@strongsystem.com', '管理部', '主任', '2016-04-01'),
    ('E010', '吉田', '麻衣', 'mai.yoshida@strongsystem.com', '営業部', '主任', '2017-04-01');
