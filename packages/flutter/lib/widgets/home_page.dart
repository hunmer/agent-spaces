import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
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
  String _scanStatus = '';
  bool _scanning = false;
  bool _scanCancelled = false;
  double _progress = 0;
  String? _foundUrl;
  String? _localFoundUrl;
  bool _hasLocalWeb = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _autoScanLocal());
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
              const SizedBox(height: 32),
              if (_scanning) ...[
                LinearProgressIndicator(value: _progress > 0 ? _progress : null),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        _scanStatus,
                        style: TextStyle(fontSize: 13, color: theme.colorScheme.onSurfaceVariant),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    const SizedBox(width: 8),
                    TextButton(
                      onPressed: _stopScan,
                      style: TextButton.styleFrom(
                        minimumSize: const Size(0, 28),
                        padding: const EdgeInsets.symmetric(horizontal: 12),
                        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                      ),
                      child: const Text('停止', style: TextStyle(fontSize: 13)),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
              ],
              if (_foundUrl != null) ...[
                ServerCard(
                  url: _foundUrl!,
                  onTap: () => widget.onServerFound(_foundUrl!),
                ),
                const SizedBox(height: 12),
              ],
              ActionCard(
                icon: Icons.folder_open,
                title: '打开本地',
                subtitle: _hasLocalWeb ? '加载内置的 Web 前端（无需服务器）' : '未找到本地 Web 资源',
                enabled: !_scanning && _hasLocalWeb,
                onTap: _openLocal,
              ),
              const SizedBox(height: 12),
              ActionCard(
                icon: Icons.wifi,
                title: '扫描内网',
                subtitle: _localFoundUrl != null
                    ? '已发现: $_localFoundUrl'
                    : '扫描本机 127.0.0.1 及本机 IP 网段',
                enabled: !_scanning,
                badge: _localFoundUrl != null,
                onTap: () {
                  if (_localFoundUrl != null) {
                    widget.onServerFound(_localFoundUrl!);
                  } else {
                    _scanLocal();
                  }
                },
              ),
              const SizedBox(height: 12),
              ActionCard(
                icon: Icons.lan,
                title: '扫描局域网',
                subtitle: '扫描 WiFi 所在网段',
                enabled: !_scanning,
                onTap: () => _scanLAN(),
              ),
              const SizedBox(height: 12),
              ActionCard(
                icon: Icons.link,
                title: '手动输入地址',
                subtitle: '输入服务器地址并设为默认',
                enabled: !_scanning,
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

  Future<void> _autoScanLocal() async {
    await _checkLocalWeb();
    if (!mounted) return;
    final result = await _quickCheck();
    if (mounted && result != null) {
      setState(() => _localFoundUrl = result);
    }
  }

  Future<void> _checkLocalWeb() async {
    try {
      await rootBundle.load('assets/web/index.html');
      if (mounted) setState(() => _hasLocalWeb = true);
    } catch (_) {}
  }

  void _openLocal() {
    widget.onServerFound('flutter_assets://web/index.html');
  }

  void _stopScan() {
    _scanCancelled = true;
    setState(() {
      _scanning = false;
      _scanStatus = '';
      _progress = 0;
    });
  }

  Future<String?> _checkHealth(String host, int port) async {
    final url = 'http://$host:$port/api/health';
    try {
      final client = HttpClient();
      client.connectionTimeout = const Duration(seconds: 2);
      final request = await client.getUrl(Uri.parse(url));
      final response = await request.close();
      final body = await response.transform(utf8.decoder).join();
      client.close();
      debugPrint('[scan] health check $url -> ${response.statusCode} body=$body');
      if (response.statusCode == 200 && body.contains('"status":"ok"')) {
        return 'http://$host:$port';
      }
    } catch (e) {
      debugPrint('[scan] health check $url FAILED: $e');
    }
    return null;
  }

  Future<String?> _quickCheck() async {
    final result = await _checkHealth('127.0.0.1', 3000);
    if (result != null) return result;
    try {
      final interfaces = await NetworkInterface.list();
      for (final iface in interfaces) {
        for (final addr in iface.addresses) {
          if (addr.type == InternetAddressType.IPv4 && !addr.isLoopback) {
            final parts = addr.address.split('.');
            if (parts.length == 4) {
              final gateway = '${parts[0]}.${parts[1]}.${parts[2]}.1';
              final r = await _checkHealth(gateway, 3000);
              if (r != null) return r;
            }
          }
        }
      }
    } catch (_) {}
    return null;
  }

  Future<void> _scanLocal() async {
    _scanCancelled = false;
    setState(() {
      _scanning = true;
      _progress = 0;
      _scanStatus = '快速检测本机...';
      _foundUrl = null;
    });

    final quick = await _quickCheck();
    if (quick != null) {
      if (mounted) {
        setState(() {
          _scanning = false;
          _foundUrl = quick;
          _localFoundUrl = quick;
          _scanStatus = '';
        });
      }
      return;
    }

    setState(() => _scanStatus = '扫描本机端口...');

    for (int port = 3000; port <= 3010; port++) {
      if (_scanCancelled) return;
      final r = await _checkHealth('127.0.0.1', port);
      if (r != null) {
        if (mounted) setState(() { _scanning = false; _foundUrl = r; _localFoundUrl = r; _scanStatus = ''; });
        return;
      }
      if (mounted) setState(() => _progress = (port - 3000 + 1) / 11);
    }

    setState(() {
      _scanning = false;
      _scanStatus = '未在本机发现服务器';
    });
  }

  Future<String?> _getWifiSubnet() async {
    try {
      final interfaces = await NetworkInterface.list();
      debugPrint('[scan] found ${interfaces.length} interfaces');
      String? wifiSubnet;
      String? fallbackSubnet;
      for (final iface in interfaces) {
        for (final addr in iface.addresses) {
          debugPrint('[scan]   ${iface.name}: ${addr.address} (${addr.type}) loopback=${addr.isLoopback}');
          if (addr.type == InternetAddressType.IPv4 && !addr.isLoopback) {
            final parts = addr.address.split('.');
            if (parts.length == 4) {
              final subnet = '${parts[0]}.${parts[1]}.${parts[2]}';
              final isWifi = iface.name.startsWith('wlan') || iface.name.startsWith('en0');
              if (isWifi) {
                debugPrint('[scan]   -> WiFi subnet: $subnet (${iface.name})');
                wifiSubnet = subnet;
              }
              fallbackSubnet ??= subnet;
            }
          }
        }
      }
      final result = wifiSubnet ?? fallbackSubnet;
      if (result != null) debugPrint('[scan]   -> selected subnet: $result');
      return result;
    } catch (e) {
      debugPrint('[scan] getWifiSubnet FAILED: $e');
    }
    return null;
  }

  Future<void> _scanLAN() async {
    _scanCancelled = false;
    setState(() {
      _scanning = true;
      _progress = 0;
      _scanStatus = '获取 WiFi 地址...';
      _foundUrl = null;
    });

    final subnet = await _getWifiSubnet();
    if (subnet == null) {
      if (mounted) setState(() { _scanning = false; _scanStatus = '无法获取 WiFi 地址'; });
      return;
    }
    debugPrint('[scan] LAN scan subnet=$subnet');

    final quick = await _quickCheck();
    if (quick != null) {
      if (mounted) setState(() { _scanning = false; _foundUrl = quick; _localFoundUrl = quick; _scanStatus = ''; });
      return;
    }

    final allHosts = List.generate(254, (i) => '$subnet.${i + 1}');

    setState(() => _scanStatus = '扫描 ${allHosts.length} 个地址...');

    const batchSize = 20;
    int checked = 0;
    for (int i = 0; i < allHosts.length; i += batchSize) {
      if (_scanCancelled) return;
      final batch = allHosts.sublist(i, i + batchSize > allHosts.length ? allHosts.length : i + batchSize);
      final results = await Future.wait(batch.map((host) => _checkHealth(host, 3000)));
      checked += batch.length;

      if (_scanCancelled) return;
      final found = results.where((r) => r != null).firstOrNull;
      if (found != null) {
        if (mounted) setState(() { _scanning = false; _foundUrl = found; _localFoundUrl = found; _scanStatus = ''; });
        return;
      }

      if (mounted) {
        setState(() {
          _progress = checked / allHosts.length;
          _scanStatus = '已扫描 $checked / ${allHosts.length}...';
        });
      }
    }

    if (mounted && !_scanCancelled) setState(() { _scanning = false; _scanStatus = '未在局域网发现服务器'; });
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
