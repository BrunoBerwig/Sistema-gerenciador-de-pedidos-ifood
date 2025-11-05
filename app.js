const MQTT_CONFIG = {
    broker: 'wss://broker.hivemq.com:8884/mqtt', // Broker público com WSS para conexões web
    clientId: 'Atendente_Web_' + Math.random().toString(16).substr(2, 8), // ID único
    topic_publish_pedidos: 'senai/iot/pedidos' // Tópico que o ESP32 e a Cozinha escutam
};

const MENU_ITEMS = [
    { id: 101, nome: "Hamburguer Clássico", preco: 35.00, categoria: "Lanches" },
    { id: 102, nome: "Batata Frita (M)", preco: 12.50, categoria: "Acompanhamentos" },
    { id: 103, nome: "Refrigerante Lata", preco: 6.00, categoria: "Bebidas" },
    { id: 104, nome: "Cerveja Artesanal", preco: 22.00, categoria: "Bebidas" },
    { id: 105, nome: "Açaí na Tigela", preco: 18.00, categoria: "Sobremesas" },
    { id: 106, nome: "Torta de Limão", preco: 14.50, categoria: "Sobremesas" },
    { id: 107, nome: "Salada Caesar", preco: 30.00, categoria: "Pratos Leves" },
    { id: 108, nome: "Água Mineral", preco: 4.00, categoria: "Bebidas" },
];

// Variáveis de Estado
let mqttClient = null;
let cartItems = {}; // { item_id: {id, nome, preco, quantidade} }
let currentOrderId = 1; // ID sequencial para cada novo pedido
let nextPedidoId = localStorage.getItem('lastPedidoId') ? parseInt(localStorage.getItem('lastPedidoId')) + 1 : 1;


// ===================================
// 2. FUNÇÕES DE UTILIDADE E UI (User Interface)
// ===================================

/** Função para evitar XSS ao renderizar HTML */
function escapeHtml(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/[&<>"']/g, function(m) {
        return ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        })[m];
    });
}

/** Atualiza o indicador de status da conexão MQTT */
function updateConnectionStatus(isConnected) {
    const statusElement = document.getElementById('connectionStatus');
    if (!statusElement) return;

    if (isConnected) {
        statusElement.classList.add('status-connected');
        statusElement.querySelector('.status-text').textContent = 'Conectado';
    } else {
        statusElement.classList.remove('status-connected');
        statusElement.querySelector('.status-text').textContent = 'Desconectado';
    }
}

/** Exibe uma notificação Toast no canto da tela */
function showToast(title, message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <strong>${title}</strong>
        <p>${message}</p>
    `;

    container.appendChild(toast);

    // Força o reflow para garantir a animação
    void toast.offsetWidth; 
    toast.classList.add('show');

    // Remove o toast após 4 segundos
    setTimeout(() => {
        toast.classList.remove('show');
        toast.addEventListener('transitionend', () => toast.remove());
    }, 4000);
}


// ===================================
// 3. LÓGICA DO MQTT
// ===================================

function connectMQTT() {
    try {
        mqttClient = mqtt.connect(MQTT_CONFIG.broker, {
            clientId: MQTT_CONFIG.clientId,
            clean: true,
            reconnectPeriod: 1000,
        });

        mqttClient.on('connect', () => {
            console.log('✓ Atendente conectado ao MQTT Broker');
            updateConnectionStatus(true);
            showToast('Conexão OK', 'Sistema pronto para enviar pedidos.', 'success');
        });

        mqttClient.on('error', (err) => {
            console.error('Erro MQTT:', err);
            updateConnectionStatus(false);
            showToast('Erro de Conexão', 'Verifique o broker e a internet.', 'error');
        });

        mqttClient.on('offline', () => {
            console.warn('Conexão MQTT perdida.');
            updateConnectionStatus(false);
            showToast('Desconectado', 'Tentando reconectar...', 'error');
        });
        
        // O Painel do Atendente não precisa subscrever nenhum tópico, apenas publicar.

    } catch (error) {
        console.error('Erro ao conectar MQTT:', error);
        updateConnectionStatus(false);
    }
}

/** Envia o pedido formatado como JSON para o tópico MQTT */
function sendOrder() {
    const mesa = document.getElementById('mesaInput').value;
    const cliente = document.getElementById('clienteInput').value;
    
    if (!mesa || Object.keys(cartItems).length === 0) {
        showToast('Erro', 'Mesa e itens são obrigatórios para o pedido.', 'error');
        return;
    }
    if (!mqttClient || !mqttClient.connected) {
        showToast('Erro', 'Não conectado ao Broker MQTT.', 'error');
        return;
    }
    
    // Converte os itens do carrinho para o formato final do JSON
    const itensPayload = Object.values(cartItems).map(item => ({
        id: item.id,
        nome: item.nome,
        quantidade: item.quantidade,
        preco: item.preco 
    }));
    
    const totalValue = Object.values(cartItems).reduce((sum, item) => sum + (item.preco * item.quantidade), 0);
    
    const payload = {
        pedido_id: nextPedidoId,
        timestamp: new Date().toISOString(),
        mesa: parseInt(mesa),
        cliente: cliente.trim() || 'Mesa ' + mesa,
        total: totalValue,
        itens: itensPayload
    };
    
    const payloadJson = JSON.stringify(payload);

    mqttClient.publish(MQTT_CONFIG.topic_publish_pedidos, payloadJson, { qos: 1 }, (error) => {
        if (error) {
            console.error('Falha na publicação:', error);
            showToast('Erro MQTT', 'Falha ao enviar pedido.', 'error');
        } else {
            // Sucesso!
            showToast('Pedido Enviado!', `Pedido #${nextPedidoId} publicado para impressão.`, 'success');
            
            // Atualiza e salva o próximo ID
            localStorage.setItem('lastPedidoId', nextPedidoId);
            nextPedidoId++; 
            
            clearCart();
            document.getElementById('mesaInput').value = nextPedidoId; // Sugere a próxima mesa
        }
    });
}


// ===================================
// 4. LÓGICA DO CARDÁPIO E CARRINHO
// ===================================

/** Gera os botões do cardápio na tela */
function renderMenuItems() {
    const container = document.getElementById('menuItemsContainer');
    if (!container) return;

    container.innerHTML = MENU_ITEMS.map(item => `
        <button 
            class="menu-item-card" 
            data-id="${item.id}" 
            data-nome="${escapeHtml(item.nome)}" 
            data-preco="${item.preco.toFixed(2)}"
            onclick="addToCart(${item.id})"
        >
            <span class="item-name">${escapeHtml(item.nome)}</span>
            <span class="item-price">R$ ${item.preco.toFixed(2).replace('.', ',')}</span>
        </button>
    `).join('');
}

/** Adiciona um item ou incrementa a quantidade no carrinho */
function addToCart(itemId) {
    const item = MENU_ITEMS.find(i => i.id === itemId);
    if (!item) return;

    if (cartItems[itemId]) {
        cartItems[itemId].quantidade += 1;
    } else {
        cartItems[itemId] = {
            id: item.id,
            nome: item.nome,
            preco: item.preco,
            quantidade: 1
        };
    }
    updateCart();
}

/** Ajusta a quantidade de um item no carrinho */
function adjustQuantity(itemId, adjustment) {
    if (cartItems[itemId]) {
        cartItems[itemId].quantidade += adjustment;
        
        if (cartItems[itemId].quantidade <= 0) {
            delete cartItems[itemId];
        }
    }
    updateCart();
}

/** Renderiza a lista do carrinho e recalcula o total */
function updateCart() {
    const container = document.getElementById('cartItemsContainer');
    const totalDisplay = document.getElementById('cartTotalValue');
    const sendButton = document.getElementById('sendOrderButton');
    let total = 0;

    const cartKeys = Object.keys(cartItems);

    if (cartKeys.length === 0) {
        container.innerHTML = `<div class="empty-state"><p>O carrinho está vazio. Adicione itens.</p></div>`;
        totalDisplay.textContent = 'R$ 0,00';
        sendButton.disabled = true;
        return;
    }

    // Renderiza itens e calcula total
    container.innerHTML = cartKeys.map(key => {
        const item = cartItems[key];
        const subtotal = item.preco * item.quantidade;
        total += subtotal;

        return `
            <div class="cart-item">
                <div class="cart-item-info">
                    <span class="cart-item-name">${escapeHtml(item.nome)}</span>
                    <span class="cart-item-price">R$ ${item.preco.toFixed(2).replace('.', ',')}</span>
                </div>
                <div class="cart-item-controls">
                    <button class="quantity-btn" onclick="adjustQuantity(${item.id}, -1)">-</button>
                    <span class="item-qty-display">${item.quantidade}</span>
                    <button class="quantity-btn" onclick="adjustQuantity(${item.id}, 1)">+</button>
                </div>
            </div>
        `;
    }).join('');

    totalDisplay.textContent = `R$ ${total.toFixed(2).replace('.', ',')}`;
    sendButton.disabled = false;
}

/** Limpa todos os itens do carrinho */
function clearCart() {
    cartItems = {};
    document.getElementById('clienteInput').value = '';
    updateCart();
    showToast('Carrinho Limpo', 'O pedido foi resetado.', 'info');
}


// ===================================
// 5. INICIALIZAÇÃO DA APLICAÇÃO
// ===================================

document.addEventListener('DOMContentLoaded', () => {
    // 1. Inicia a conexão MQTT
    connectMQTT();
    
    // 2. Renderiza o cardápio
    renderMenuItems();
    
    // 3. Carrega o carrinho e o total
    updateCart();
    
    // 4. Preenche a sugestão de mesa
    document.getElementById('mesaInput').value = nextPedidoId;

    console.log('✓ Aplicação Atendente inicializada.');
});