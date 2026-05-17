import 'package:flutter/material.dart';

class AboutScreen extends StatelessWidget {
  const AboutScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('关于', style: TextStyle(fontSize: 16)),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, size: 20),
          onPressed: () => Navigator.of(context).pop(),
        ),
      ),
      body: ListView(
        children: [
          const SizedBox(height: 32),
          Icon(Icons.hub_outlined, size: 64, color: theme.colorScheme.primary),
          const SizedBox(height: 12),
          Center(
            child: Text(
              'Agent Spaces',
              style: theme.textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.bold,
              ),
            ),
          ),
          const SizedBox(height: 4),
          Center(
            child: Text(
              'v0.1.0',
              style: TextStyle(
                fontSize: 13,
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
          ),
          const SizedBox(height: 8),
          Center(
            child: Text(
              '本地多 Agent 协同编程平台',
              style: TextStyle(
                fontSize: 13,
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
          ),
          const SizedBox(height: 24),
          _SectionHeader(title: '项目'),
          ListTile(
            dense: true,
            leading: const Icon(Icons.info_outline, size: 20),
            title: const Text('项目名称', style: TextStyle(fontSize: 13)),
            subtitle: const Text(
              'Agent Spaces',
              style: TextStyle(fontSize: 11),
            ),
          ),
          ListTile(
            dense: true,
            leading: const Icon(Icons.description_outlined, size: 20),
            title: const Text('描述', style: TextStyle(fontSize: 13)),
            subtitle: const Text(
              'Multi-Agent Collaborative Programming Platform',
              style: TextStyle(fontSize: 11),
            ),
          ),
          ListTile(
            dense: true,
            leading: const Icon(Icons.tag, size: 20),
            title: const Text('版本', style: TextStyle(fontSize: 13)),
            subtitle: const Text(
              '0.1.0 (Build 1)',
              style: TextStyle(fontSize: 11),
            ),
          ),
          _SectionHeader(title: '链接'),
          ListTile(
            dense: true,
            leading: const Icon(Icons.code, size: 20),
            title: const Text('GitHub', style: TextStyle(fontSize: 13)),
            subtitle: const Text(
              'github.com/hunmer/agent-spaces',
              style: TextStyle(fontSize: 11),
            ),
            onTap: () {
              // TODO: launchUrl
            },
          ),
          ListTile(
            dense: true,
            leading: const Icon(Icons.bug_report_outlined, size: 20),
            title: const Text('提交 Issue', style: TextStyle(fontSize: 13)),
            subtitle: const Text(
              'github.com/hunmer/agent-spaces/issues',
              style: TextStyle(fontSize: 11),
            ),
            onTap: () {
              // TODO: launchUrl
            },
          ),
          _SectionHeader(title: '技术栈'),
          ListTile(
            dense: true,
            leading: const Icon(Icons.phone_android, size: 20),
            title: const Text('移动端', style: TextStyle(fontSize: 13)),
            subtitle: const Text(
              'Flutter + Riverpod + InAppWebView',
              style: TextStyle(fontSize: 11),
            ),
          ),
          ListTile(
            dense: true,
            leading: const Icon(Icons.web, size: 20),
            title: const Text('Web 端', style: TextStyle(fontSize: 13)),
            subtitle: const Text(
              'Next.js 16 + TailwindCSS + shadcn/ui',
              style: TextStyle(fontSize: 11),
            ),
          ),
          ListTile(
            dense: true,
            leading: const Icon(Icons.dns_outlined, size: 20),
            title: const Text('服务端', style: TextStyle(fontSize: 13)),
            subtitle: const Text(
              'Express 5 + WebSocket + SQLite',
              style: TextStyle(fontSize: 11),
            ),
          ),
          const SizedBox(height: 24),
          Center(
            child: Text(
              '© 2026 Agent Spaces',
              style: TextStyle(
                fontSize: 11,
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
          ),
          const SizedBox(height: 16),
        ],
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  final String title;
  const _SectionHeader({required this.title});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
      child: Text(
        title,
        style: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w600,
          color: Theme.of(context).colorScheme.primary,
        ),
      ),
    );
  }
}
