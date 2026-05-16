import * as React from 'react';
import { Html, Body, Head, Heading, Hr, Container, Preview, Section, Text, Button } from '@react-email/components';
import { getAppUrl } from '@/lib/urls';

interface ReceiptEmailProps {
  orderNumber: string;
  customerName: string;
  totalAmount: number;
  items: { title: string; quantity: number; price: number }[];
  sessionId: string;
  appUrl: string;
}

export default function ReceiptEmail({
  orderNumber = "VV6BHSAI",
  customerName = "Valued Collector",
  totalAmount = 0,
  items = [],
  sessionId = "",
  appUrl = getAppUrl()
}: ReceiptEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Your Arianova Selection is Secured - Order #{orderNumber}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Allocation Confirmed</Heading>
          <Text style={text}>
            Thank you, {customerName}. Your order has been successfully secured and is currently undergoing fulfillment preparation by our sommeliers.
          </Text>

          <Hr style={hr} />

          <Section style={orderSection}>
            <Text style={label}>Order Identifier Number</Text>
            <Text style={data}>{orderNumber}</Text>
          </Section>

          <Section style={orderSection}>
            <Text style={label}>Amount Settled</Text>
            <Text style={data}>${(totalAmount / 100).toFixed(2)}</Text>
          </Section>

          <Hr style={hr} />

          <Heading style={h2}>Acquired Vintages</Heading>
          <Section style={itemsSection}>
            {items.map((item, idx) => (
              <React.Fragment key={idx}>
                <Text style={itemTitle}>{item.title}</Text>
                <Text style={itemMeta}>
                  Qty: {item.quantity} • ${(item.price / 100).toFixed(2)}
                </Text>
              </React.Fragment>
            ))}
          </Section>

          <Hr style={hr} />

          <Section style={buttonContainer}>
            <Button
              style={{ ...button, padding: '14px 24px' }}
              href={`${appUrl}/success?session_id=${sessionId}`}
            >
              Track Your Vintage
            </Button>
          </Section>

          <Text style={footer}>
            Authenticity Guaranteed by Arianova ltd
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

// Inline CSS enforcing strict ESP compatibility guarantees & Noir Brand Style
const main = {
  backgroundColor: '#0B0B0B',
  fontFamily: 'Georgia, "Times New Roman", Times, serif',
  padding: '40px 0',
};

const container = {
  backgroundColor: '#1A1A1A',
  margin: '0 auto',
  padding: '40px',
  maxWidth: '600px',
  border: '1px solid rgba(245, 245, 245, 0.1)',
  borderRadius: '2px',
};

const h1 = {
  color: '#C5A059',
  fontSize: '28px',
  fontWeight: 'normal',
  margin: '0 0 20px',
  textAlign: 'center' as const,
};

const h2 = {
  color: '#C5A059',
  fontSize: '20px',
  fontWeight: 'normal',
  margin: '0 0 20px',
};

const text = {
  color: 'rgba(245, 245, 245, 0.8)',
  fontSize: '16px',
  lineHeight: '26px',
  textAlign: 'center' as const,
};

const orderSection = {
  margin: '20px 0',
};

const label = {
  color: 'rgba(245, 245, 245, 0.4)',
  fontSize: '10px',
  textTransform: 'uppercase' as const,
  letterSpacing: '2px',
  fontWeight: 'bold',
  margin: '0 0 4px',
};

const data = {
  color: '#F5F5F5',
  fontSize: '20px',
  margin: '0',
};

const itemsSection = {
  marginBottom: '20px',
};

const itemTitle = {
  color: '#F5F5F5',
  fontSize: '16px',
  margin: '0 0 4px',
};

const itemMeta = {
  color: '#C5A059',
  fontSize: '10px',
  textTransform: 'uppercase' as const,
  letterSpacing: '2px',
  fontWeight: 'bold',
  margin: '0 0 16px',
};

const buttonContainer = {
  textAlign: 'center' as const,
  margin: '30px 0',
};

const button = {
  backgroundColor: '#C5A059',
  color: '#0B0B0B',
  fontSize: '12px',
  fontWeight: 'bold',
  textTransform: 'uppercase' as const,
  letterSpacing: '3px',
  textDecoration: 'none',
  borderRadius: '2px',
};

const hr = {
  borderColor: 'rgba(245, 245, 245, 0.1)',
  margin: '30px 0',
};

const footer = {
  color: 'rgba(245, 245, 245, 0.5)',
  fontSize: '10px',
  textTransform: 'uppercase' as const,
  letterSpacing: '2px',
  fontWeight: 'bold',
  textAlign: 'center' as const,
  margin: '40px 0 0',
};
