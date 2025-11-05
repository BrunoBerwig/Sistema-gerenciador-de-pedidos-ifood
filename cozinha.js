// ===================================
// CONFIGURAÇÃO DA COZINHA
// ===================================
const MQTT_CONFIG = {
    broker: 'wss://broker.hivemq.com:8884/mqtt',
    clientId: 'Cozinha_Web_' + Math.random().toString(16).substr(2, 8),
    topic_subscribe_pedidos: 'senai/iot/pedidos', // Tópico para receber
    topic_publish_pronto: 'senai/iot/status/pronto' // Tópico para publicar
};

let mqttClient = null;
let activeOrders = {}; // Armazena pedidos em preparo (chave: pedido_id)

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
            console.log('✓ Cozinha conectada ao MQTT Broker');
            updateConnectionStatus(true);
            showToast('Conectado', 'Pronto para receber pedidos', 'success');
            
            // SUBSCREVE TÓPICO DE PEDIDOS
            mqttClient.subscribe(MQTT_CONFIG.topic_subscribe_pedidos, { qos: 1 }, (err) => {
                if (!err) {
                    console.log(`✓ Inscrito no tópico: ${MQTT_CONFIG.topic_subscribe_pedidos}`);
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
    if (topic === MQTT_CONFIG.topic_subscribe_pedidos) {
        try {
            const order = JSON.parse(message.toString());
            addOrderToKitchen(order);
        } catch (e) {
            console.error('Erro ao analisar JSON do pedido:', e);
        }
    }
}

function addOrderToKitchen(order) {
    const orderId = order.pedido_id;
    if (activeOrders[orderId]) return; // Evitar duplicidade (caso o broker retransmita)

    activeOrders[orderId] = order;
    renderKitchenOrders();
    showToast('Novo Pedido!', `Mesa ${order.mesa} (#${orderId})`, 'info');
}

function renderKitchenOrders() {
    const container = document.getElementById('kitchenOrdersContainer');
    const emptyState = document.getElementById('emptyStateCozinha');

    if (Object.keys(activeOrders).length === 0) {
        container.innerHTML = '';
        emptyState.style.display = 'block';
        return;
    }
    
    emptyState.style.display = 'none';
    
    container.innerHTML = Object.values(activeOrders).map(order => `
        <div class="order-card-kitchen">
            <div class="order-header">
                <h3 class="order-title">Mesa ${order.mesa} - Pedido #${order.pedido_id}</h3>
            </div>
            <div class="order-client">Cliente: ${escapeHtml(order.cliente || 'Sem Nome')}</div>
            <ul class="order-items-list">
                ${order.itens.map(item => `
                    <li>
                        <span class="item-qty">${item.quantidade}x</span>
                        <span class="item-name">${escapeHtml(item.nome)}</span>
                    </li>
                `).join('')}
            </ul>
            <button class="btn btn-success full-width" onclick="markAsReady(${order.pedido_id}, ${order.mesa})">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                Pronto (Enviar para o Caixa)
            </button>
        </div>
    `).join('');
}

function markAsReady(pedido_id, mesa) {
    if (!mqttClient || !mqttClient.connected) {
        showToast('Erro de conexão', 'Não conectado ao MQTT', 'error');
        return;
    }

    const statusPayload = {
        pedido_id: pedido_id,
        mesa: mesa,
        timestamp: new Date().toISOString(),
        status: 'pronto'
    };

    mqttClient.publish(MQTT_CONFIG.topic_publish_pronto, JSON.stringify(statusPayload), { qos: 1 }, (error) => {
        if (error) {
            console.error('Erro ao publicar status:', error);
            showToast('Erro', 'Falha ao enviar status Pronto', 'error');
        } else {
            // Remove da lista da Cozinha e renderiza
            delete activeOrders[pedido_id];
            renderKitchenOrders();
            showToast('Status Enviado', `Pedido #${pedido_id} pronto!`, 'success');
        }
    });
}

// ===================================
// INICIALIZAÇÃO
// ===================================
document.addEventListener('DOMContentLoaded', () => {
    // Nota: O código de utilidade (showToast, escapeHtml) e a conexão MQTT
    // devem ser definidos antes de connectMQTT ser chamado.
    connectMQTT();
    console.log('✓ Cozinha App inicializado');
});