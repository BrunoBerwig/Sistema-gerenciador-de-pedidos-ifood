// ===================================
// CONFIGURAÇÃO DO CAIXA
// ===================================
const MQTT_CONFIG = {
    broker: 'wss://broker.hivemq.com:8884/mqtt',
    clientId: 'Caixa_Web_' + Math.random().toString(16).substr(2, 8),
    topic_subscribe_pronto: 'senai/iot/status/pronto', // Tópico para receber
    topic_publish_finalizado: 'senai/iot/status/finalizado' // Tópico para publicar
};

let mqttClient = null;
let readyOrders = {}; // Armazena pedidos prontos (chave: pedido_id)

// ===================================
// FUNÇÕES UTILS (Copiar de app.js)
// ===================================
// [Copie e cole aqui as funções: connectMQTT, updateConnectionStatus, showToast e escapeHtml do seu app.js]

function connectMQTT() {
    try {
        mqttClient = mqtt.connect(MQTT_CONFIG.broker, {
            clientId: MQTT_CONFIG.clientId,
            clean: true,
            reconnectPeriod: 1000,
        });

        mqttClient.on('connect', () => {
            console.log('✓ Caixa conectado ao MQTT Broker');
            updateConnectionStatus(true);
            showToast('Conectado', 'Pronto para receber status', 'success');
            
            // SUBSCREVE TÓPICO DE STATUS PRONTO
            mqttClient.subscribe(MQTT_CONFIG.topic_subscribe_pronto, { qos: 1 }, (err) => {
                if (!err) {
                    console.log(`✓ Inscrito no tópico: ${MQTT_CONFIG.topic_subscribe_pronto}`);
                }
            });
        });
        
        // ... (Copie as handlers 'error', 'offline', 'reconnect' do app.js)
        
        mqttClient.on('message', handleMQTTMessage);

    } catch (error) {
        console.error('Erro ao conectar MQTT:', error);
        updateConnectionStatus(false);
    }
}

// ===================================
// TRATAMENTO DE MENSAGENS E PEDIDOS
// ===================================

function handleMQTTMessage(topic, message) {
    if (topic === MQTT_CONFIG.topic_subscribe_pronto) {
        try {
            const status = JSON.parse(message.toString());
            addOrderToCashier(status);
        } catch (e) {
            console.error('Erro ao analisar JSON de status:', e);
        }
    }
}

function addOrderToCashier(status) {
    const orderId = status.pedido_id;
    if (readyOrders[orderId]) return;

    readyOrders[orderId] = status;
    renderCashierOrders();
    showToast('Pronto para Cobrança!', `Mesa ${status.mesa} (#${orderId})`, 'info');
}

function renderCashierOrders() {
    const container = document.getElementById('cashierOrdersContainer');
    const emptyState = document.getElementById('emptyStateCaixa');

    if (Object.keys(readyOrders).length === 0) {
        container.innerHTML = '';
        emptyState.style.display = 'block';
        return;
    }
    
    emptyState.style.display = 'none';
    
    container.innerHTML = Object.values(readyOrders).map(order => {
        // Nota: O total está no JSON original do Atendente. Aqui teremos
        // que simular ou buscar em um armazenamento local (se implementado)
        const totalSimulado = order.total ? order.total.toFixed(2) : 'Aguardando Total';
        
        return `
            <div class="order-card-cashier status-ready">
                <div class="order-header">
                    <h3 class="order-title">Mesa ${order.mesa} - Pedido #${order.pedido_id}</h3>
                    <div class="order-status">PRONTO</div>
                </div>
                <div class="order-details">
                    Total: <span class="total-value-large">R$ ${totalSimulado}</span>
                </div>
                <button class="btn btn-primary full-width" onclick="markAsFinalized(${order.pedido_id})">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12H3"/><path d="M12 3v18"/></svg>
                    Finalizar Cobrança
                </button>
            </div>
        `;
    }).join('');
}

function markAsFinalized(pedido_id) {
    if (!mqttClient || !mqttClient.connected) {
        showToast('Erro de conexão', 'Não conectado ao MQTT', 'error');
        return;
    }

    const statusPayload = {
        pedido_id: pedido_id,
        timestamp: new Date().toISOString(),
        status: 'finalizado'
    };

    mqttClient.publish(MQTT_CONFIG.topic_publish_finalizado, JSON.stringify(statusPayload), { qos: 1 }, (error) => {
        if (error) {
            console.error('Erro ao publicar status:', error);
            showToast('Erro', 'Falha ao enviar status Finalizado', 'error');
        } else {
            // Remove da lista do Caixa
            delete readyOrders[pedido_id];
            renderCashierOrders();
            showToast('Cobrança Finalizada', `Pedido #${pedido_id} finalizado.`, 'success');
        }
    });
}

// ===================================
// INICIALIZAÇÃO
// ===================================
document.addEventListener('DOMContentLoaded', () => {
    connectMQTT();
    console.log('✓ Caixa App inicializado');
});