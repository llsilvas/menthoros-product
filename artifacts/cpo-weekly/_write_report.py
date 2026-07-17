import os, sys
report = ''
with open('/workspace/menthoros-product/artifacts/cpo-weekly/_report_content.txt', 'r') as f:
    report = f.read()
path = '/workspace/menthoros-product/artifacts/cpo-weekly/2026-07-16.md'
with open(path, 'w') as f:
    f.write(report)
print('OK:', os.path.getsize(path), 'bytes')
