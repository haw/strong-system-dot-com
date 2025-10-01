-- ========================================
-- Strong System Employee Management System
-- Docker Container Database Initialization Script
-- ========================================
-- 
-- Task 2.2: データベース初期化スクリプトの作成
-- 
-- このスクリプトは、Dockerコンテナ環境用の
-- データベース初期化を行います。
-- 
-- 対象環境: Docker MySQL 8.4
-- 作成日: 2025-07-19
-- 
-- ========================================

-- データベース作成
CREATE DATABASE IF NOT EXISTS employee_db;
USE employee_db;

-- 従業員テーブル作成
CREATE TABLE IF NOT EXISTS employees (
    id INT AUTO_INCREMENT PRIMARY KEY COMMENT '従業員ID（内部用）',
    employee_id VARCHAR(10) NOT NULL UNIQUE COMMENT '社員番号（一意）',
    first_name VARCHAR(50) NOT NULL COMMENT '名',
    last_name VARCHAR(50) NOT NULL COMMENT '姓',
    email VARCHAR(100) NOT NULL UNIQUE COMMENT 'メールアドレス（一意）',
    department VARCHAR(50) NOT NULL COMMENT '部署名',
    position VARCHAR(50) COMMENT '役職',
    phone VARCHAR(20) COMMENT '電話番号',
    hire_date DATE COMMENT '入社日',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'レコード作成日時',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'レコード更新日時',
    
    -- インデックス定義
    INDEX idx_employee_id (employee_id),
    INDEX idx_department (department),
    INDEX idx_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ファイルテーブル作成
CREATE TABLE IF NOT EXISTS files (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  path VARCHAR(1024) NOT NULL,
  size BIGINT NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  owner_id INT,
  folder_id VARCHAR(36),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES employees(id) ON DELETE SET NULL
);

-- フォルダテーブル作成
CREATE TABLE IF NOT EXISTS folders (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  path VARCHAR(1024) NOT NULL,
  parent_id VARCHAR(36),
  owner_id INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES employees(id) ON DELETE SET NULL,
  FOREIGN KEY (parent_id) REFERENCES folders(id) ON DELETE CASCADE
);

-- サンプルデータ挿入
-- ストロングシステム株式会社の架空の従業員データ
INSERT INTO employees (employee_id, first_name, last_name, email, department, position, phone, hire_date)
VALUES
    ('E001', '太郎', '山田', 'taro.yamada@strongsystem.com', '開発部', '主任', '03-1234-5678', '2015-04-01'),
    ('E002', '花子', '鈴木', 'hanako.suzuki@strongsystem.com', '営業部', '課長', '03-1234-5679', '2010-04-01'),
    ('E003', '一郎', '佐藤', 'ichiro.sato@strongsystem.com', '管理部', '部長', '03-1234-5680', '2005-04-01'),
    ('E004', '恵子', '田中', 'keiko.tanaka@strongsystem.com', '人事部', '主任', '03-1234-5681', '2018-04-01'),
    ('E005', '健太', '伊藤', 'kenta.ito@strongsystem.com', '開発部', '社員', '03-1234-5682', '2020-04-01'),
    ('E006', '美咲', '高橋', 'misaki.takahashi@strongsystem.com', '営業部', '社員', '03-1234-5683', '2019-04-01'),
    ('E007', '雄介', '渡辺', 'yusuke.watanabe@strongsystem.com', '開発部', '課長', '03-1234-5684', '2012-04-01'),
    ('E008', '由美', '小林', 'yumi.kobayashi@strongsystem.com', '人事部', '社員', '03-1234-5685', '2021-04-01'),
    ('E009', '大輔', '加藤', 'daisuke.kato@strongsystem.com', '管理部', '主任', '03-1234-5686', '2016-04-01'),
    ('E010', '麻衣', '吉田', 'mai.yoshida@strongsystem.com', '営業部', '主任', '03-1234-5687', '2017-04-01')
ON DUPLICATE KEY UPDATE
    first_name = VALUES(first_name),
    last_name = VALUES(last_name),
    email = VALUES(email),
    department = VALUES(department),
    position = VALUES(position),
    phone = VALUES(phone),
    hire_date = VALUES(hire_date),
    updated_at = CURRENT_TIMESTAMP;

-- ルートフォルダ作成
INSERT INTO folders (id, name, path, parent_id, owner_id)
VALUES
  ('00000000-0000-0000-0000-000000000000', 'root', '/', NULL, 1),
  ('11111111-1111-1111-1111-111111111111', '開発部', '/開発部', '00000000-0000-0000-0000-000000000000', 1),
  ('22222222-2222-2222-2222-222222222222', '営業部', '/営業部', '00000000-0000-0000-0000-000000000000', 2),
  ('33333333-3333-3333-3333-333333333333', '管理部', '/管理部', '00000000-0000-0000-0000-000000000000', 3),
  ('44444444-4444-4444-4444-444444444444', '人事部', '/人事部', '00000000-0000-0000-0000-000000000000', 4);