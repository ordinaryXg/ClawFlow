import { FC, useEffect, useMemo } from 'react';
import { Form, Input, Modal } from 'antd';
import { useTranslation } from 'react-i18next';
import { Connector, ConnectorConfig } from '../../store/modules/connectorStore';
import { CfSelectWithHints } from '../CfSelectWithHints';

interface Props {
  open: boolean;
  loading?: boolean;
  initial: Connector | null;
  onClose: () => void;
  onSubmit: (values: ConnectorConfig) => void;
}

const ConnectorForm: FC<Props> = ({ open, loading, initial, onClose, onSubmit }) => {
  const { t } = useTranslation();
  const [form] = Form.useForm<{
    name: string;
    type: string;
    configJson: string;
  }>();

  const isEdit = !!initial;

  const typeOptions = useMemo(
    () => [
      { value: 'github', label: t('connectors.typeGithub'), hint: t('connectors.typeHintGithub') },
      { value: 'jira', label: t('connectors.typeJira'), hint: t('connectors.typeHintJira') },
      { value: 'slack', label: t('connectors.typeSlack'), hint: t('connectors.typeHintSlack') },
      { value: 'webhook', label: t('connectors.typeWebhook'), hint: t('connectors.typeHintWebhook') },
      { value: 'custom', label: t('connectors.typeCustom'), hint: t('connectors.typeHintCustom') },
    ],
    [t],
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
    throw new Error(t('connectors.formConfigInvalidObject'));
  };

  return (
    <Modal
      open={open}
      title={isEdit ? t('connectors.formEditTitle') : t('connectors.formAddTitle')}
      okText={isEdit ? t('connectors.formOkEdit') : t('connectors.formOkAdd')}
      cancelText={t('connectors.formCancel')}
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
      <Form form={form} layout="vertical" initialValues={{ name: '', type: 'github', configJson: '{}' }}>
        <Form.Item
          label={t('connectors.formNameLabel')}
          name="name"
          rules={[
            { required: true, message: t('connectors.formNameRequired') },
            { max: 60, message: t('connectors.formNameTooLong') },
          ]}
        >
          <Input placeholder={t('connectors.formNamePh')} />
        </Form.Item>

        <Form.Item label={t('connectors.formTypeLabel')} name="type" rules={[{ required: true, message: t('connectors.formTypeRequired') }]}>
          <CfSelectWithHints
            options={typeOptions}
            hintIconAriaBase={t('common.selectOptionHintAria')}
            aria-label={t('connectors.formTypeLabel')}
            popupMatchSelectWidth={false}
          />
        </Form.Item>

        <Form.Item
          label={t('connectors.formConfigLabel')}
          name="configJson"
          rules={[
            { required: true, message: t('connectors.formConfigRequired') },
            {
              validator: async (_, value) => {
                try {
                  parseConfig(String(value ?? ''));
                  return Promise.resolve();
                } catch (e: any) {
                  return Promise.reject(new Error(e?.message || t('connectors.formConfigJsonInvalid')));
                }
              },
            },
          ]}
        >
          <Input.TextArea autoSize={{ minRows: 6, maxRows: 14 }} placeholder={t('connectors.formConfigPh')} />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default ConnectorForm;
