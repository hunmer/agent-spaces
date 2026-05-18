import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'home_cards.dart';

class HomePage extends StatefulWidget {
  final void Function(String url) onServerFound;
  final String homeUrl;

  const HomePage({super.key, required this.onServerFound, required this.homeUrl});

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  bool _hasLocalWeb = false;
  bool _frontendAvailable = false;
  bool _backendAvailable = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _autoCheck());
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 480),
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Title row with server badges
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  Expanded(child: Column(children: [
                    Icon(Icons.hub, size: 56, color: theme.colorScheme.primary),
                    const SizedBox(height: 16),
                    Text(
                      'Agent Spaces',
                      style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      '连接到 Agent Spaces 服务器',
                      style: theme.textTheme.bodyMedium?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                    ),
                  ])),
                  // Right side server buttons
                  if (_frontendAvailable || _backendAvailable)
                    Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (_backendAvailable)
                          _ServerBadge(
                            label: '后端服务器',
                            color: Colors.green,
                            onTap: () => widget.onServerFound('http://127.0.0.1:3100'),
                          ),
                        if (_frontendAvailable) ...[
                          const SizedBox(height: 6),
                          _ServerBadge(
                            label: '前端服务器',
                            color: Colors.blue,
                            onTap: () => widget.onServerFound('http://127.0.0.1:3000'),
                          ),
                        ],
                      ],
                    ),
                ],
              ),
              const SizedBox(height: 32),
              ActionCard(
                icon: Icons.folder_open,
                title: '打开本地',
                subtitle: _hasLocalWeb ? '加载内置的 Web 前端（无需服务器）' : '未找到本地 Web 资源',
                enabled: _hasLocalWeb,
                onTap: _openLocal,
              ),
              const SizedBox(height: 12),
              ActionCard(
                icon: Icons.link,
                title: '手动输入地址',
                subtitle: '输入服务器地址并设为默认',
                enabled: true,
                onTap: () => _showManualInput(),
              ),
              const SizedBox(height: 12),
              ActionCard(
                icon: Icons.info_outline,
                title: '关于 Agent Spaces',
                subtitle: '版本信息与项目链接',
                enabled: true,
                onTap: () => context.push('/about'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _autoCheck() async {
    await _checkLocalWeb();
    // Check both servers in parallel
    final results = await Future.wait([
      _checkUrl('http://127.0.0.1:3000'),
      _checkHealth('127.0.0.1', 3100),
    ]);
    if (!mounted) return;
    setState(() {
      _frontendAvailable = results[0];
      _backendAvailable = results[1];
    });
  }

  Future<void> _checkLocalWeb() async {
    try {
      final client = HttpClient();
      client.connectionTimeout = const Duration(milliseconds: 500);
      final request = await client.getUrl(Uri.parse('http://localhost:8080/index.html'));
      final response = await request.close();
      client.close();
      if (response.statusCode == 200 && mounted) {
        setState(() => _hasLocalWeb = true);
      }
    } catch (_) {}
  }

  Future<bool> _checkUrl(String url) async {
    try {
      final client = HttpClient();
      client.connectionTimeout = const Duration(seconds: 2);
      final request = await client.getUrl(Uri.parse(url));
      final response = await request.close();
      client.close();
      return response.statusCode == 200;
    } catch (_) {
      return false;
    }
  }

  Future<bool> _checkHealth(String host, int port) async {
    final url = 'http://$host:$port/api/health';
    try {
      final client = HttpClient();
      client.connectionTimeout = const Duration(seconds: 2);
      final request = await client.getUrl(Uri.parse(url));
      final response = await request.close();
      final body = await response.transform(utf8.decoder).join();
      client.close();
      return response.statusCode == 200 && body.contains('"status":"ok"');
    } catch (_) {
      return false;
    }
  }

  void _openLocal() {
    widget.onServerFound('http://localhost:8080/index.html');
  }

  void _showManualInput() {
    final controller = TextEditingController(text: widget.homeUrl);
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('输入服务器地址'),
        content: TextField(
          controller: controller,
          autofocus: true,
          decoration: const InputDecoration(
            hintText: 'http://192.168.1.100:3000',
            prefixIcon: Icon(Icons.link, size: 18),
          ),
          onSubmitted: (v) => _connectManual(ctx, v),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(), child: const Text('取消')),
          TextButton(onPressed: () => _connectManual(ctx, controller.text), child: const Text('连接')),
        ],
      ),
    );
  }

  void _connectManual(BuildContext ctx, String raw) {
    if (raw.isEmpty) return;
    final url = raw.startsWith('http') ? raw : 'http://$raw';
    Navigator.of(ctx).pop();
    widget.onServerFound(url);
  }
}

class _ServerBadge extends StatelessWidget {
  final String label;
  final Color color;
  final VoidCallback onTap;

  const _ServerBadge({required this.label, required this.color, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: color.withValues(alpha: 0.1),
      borderRadius: BorderRadius.circular(8),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(8),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.circle, size: 8, color: color),
              const SizedBox(width: 6),
              Text(
                label,
                style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: color),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
