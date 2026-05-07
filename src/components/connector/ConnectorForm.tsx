import { FC, useEffect, useMemo } from 'react';
import { Form, Input, Modal, Select } from 'antd';
import { Connector, ConnectorConfig } from '../../store/modules/connectorStore';

interface Props {
  open: boolean;
  loading?: boolean;
  initial: Connector | null;
  onClose: () => void;
  onSubmit: (values: ConnectorConfig) => void;
}

const ConnectorForm: FC<Props> = ({ open, loading, initial, onClose, onSubmit }) => {
  const [form] = Form.useForm<{
    name: string;
    type: string;
    configJson: string;
  }>();

  const isEdit = !!initial;

  const typeOptions = useMemo(
    () => [
      { label: 'GitHub', value: 'github' },
      { label: 'Jira', value: 'jira' },
      { label: 'Slack', value: 'slack' },
      { label: 'Webhook', value: 'webhook' },
      { label: '自定义', value: 'custom' },
    ],
    []
  );

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      name: initial?.name ?? '',
      type: initial?.type ?? 'github',
      configJson: JSON.stringify(initial?.config ?? {}, null, 2),
    });
  }, [open, initial, form]);

  const parseConfig = (raw: string): Record<string, any> => {
    const trimmed = raw.trim();
    if (!trimmed) return {};
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    throw new Error('配置必须是 JSON 对象');
  };

  return (
    <Modal
      open={open}
      title={isEdit ? '编辑连接器' : '添加连接器'}
      okText={isEdit ? '保存' : '添加'}
      cancelText="取消"
      confirmLoading={loading}
      onCancel={onClose}
      onOk={() => {
        form
          .validateFields()
          .then((values) => {
            const cfg = parseConfig(values.configJson);
            onSubmit({ name: values.name.trim(), type: values.type, config: cfg });
          })
          .catch(() => undefined);
      }}
      destroyOnClose
    >
      <Form form={form} layout="vertical">
        <Form.Item
          label="名称"
          name="name"
          rules={[
            { required: true, message: '请输入连接器名称' },
            { max: 60, message: '名称过长' },
          ]}
        >
          <Input placeholder="例如：GitHub" />
        </Form.Item>

        <Form.Item label="类型" name="type" rules={[{ required: true, message: '请选择类型' }]}>
          <Select options={typeOptions} />
        </Form.Item>

        <Form.Item
          label="配置（JSON）"
          name="configJson"
          rules={[
            { required: true, message: '请输入配置 JSON（至少 {}）' },
            {
              validator: async (_, value) => {
                try {
                  parseConfig(String(value ?? ''));
                  return Promise.resolve();
                } catch (e: any) {
                  return Promise.reject(new Error(e?.message || 'JSON 格式不正确'));
                }
              },
            },
          ]}
        >
          <Input.TextArea autoSize={{ minRows: 6, maxRows: 14 }} placeholder='例如：{ "token": "xxx" }' />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default ConnectorForm;

