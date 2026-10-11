import type { TableMeta } from './admin-data';
export const TABLE_META: TableMeta[] = [
  {
    name: "settings",
    label: "设置",
    description: "后台的参数设置。是否包含认证信息由单独的开关决定。",
    primaryKey: ["key"],
  },
  {
    name: "announcements",
    label: "公告",
    description: "首页展示的公告。",
    primaryKey: ["id"],
  },
  {
    name: "generation_log",
    label: "生成日志",
    description: "每次生成记录一行（统计数据来源）。",
    primaryKey: ["id"],
  },
  {
    name: "yahoo_circles",
    label: "圈子数据",
    description: "已生成圈子的本体，体积最大（单条约数 KB 至数百 KB）。",
    primaryKey: ["id"],
  },
  {
    name: "feedbacks",
    label: "用户反馈",
    description: "生成页提交的反馈及可选联系方式。",
    primaryKey: ["id"],
  },
];


export const SCHEMA_VERSION = 3;
export class ImportError extends Error {}
