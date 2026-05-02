export type User = {
  id: string;
  name: string;
  email: string;
};

export const USERS: User[] = [
  { id: '1', name: '张三', email: 'zhangsan@example.com' },
  { id: '2', name: '李四', email: 'lisi@example.com' },
  { id: '3', name: '王五', email: 'wangwu@example.com' },
  { id: '4', name: '赵六', email: 'zhaoliu@example.com' },
  { id: '5', name: 'Alice', email: 'alice@example.com' },
  { id: '6', name: 'Bob', email: 'bob@example.com' },
];
